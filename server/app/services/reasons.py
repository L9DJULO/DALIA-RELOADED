"""Contextual verdict + reason generators.

Every reason is a dict ``{"text": str, "kind": str, "champions": [str]}``:
  - ``kind`` ∈ {"synergy", "counter", "warning", "info"} — drives bullet
    colour in the UI.
  - ``champions`` lists the concrete champion names referenced in ``text``.

No recalculation here — rules consume the matchup / synergy details and
the ally-only comp summary that ``draft_engine._score_candidate`` has
already computed.

Reason priority (when trimming to max_reasons):
  1. Mechanical, candidate-specific (MATCHUP_REASONS / SYNERGY_REASONS) —
     these explain *why* the matchup is favourable in concrete kit terms.
  2. Generic archetype rules.
  3. Delta fallback ("+5 % vs X").
  4. Composition fillers.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.models.champion import Champion
from app.models.draft import DraftState


# ── Small helpers ────────────────────────────────────────────────────
def _mk(text: str, kind: str, *names: str) -> Dict:
    return {
        "text": text,
        "kind": kind,
        "champions": [n for n in names if n],
    }


# ════════════════════════════════════════════════════════════════════
# Mechanical pattern dictionaries
# ════════════════════════════════════════════════════════════════════
# Each entry is (candidate_pattern, enemy_pattern, template).
# Patterns are evaluated against tags + ratings + the candidate's `key`
# so we can encode champion-specific kits (Nilah passive, Fiora W, …).
# Templates use {cand} / {enemy} placeholders.
#
# "auto_attacker"   – relies on basic attacks for damage (Marksman, on-hit,
#                     Yone/Master Yi/Tryndamere, Kalista/Aphelios).
# "immobile"        – low mobility carry (most ADCs except Lucian/Tristana).
# "engage"          – primary engage tool (Malphite, Leona, Rell, Xin Zhao).
# "squishy"         – low tankiness, no shields/sustain.
# "poke"            – pre-fight harass kit (Xerath, Ziggs, Varus poke).
# "burst"           – assassin or burst mage.
# "tank"            – frontline.
# "sustain"         – heal/lifesteal-driven (Soraka, Yuumi, Aatrox, Vlad,
#                     Mundo, Zac, Sona, Senna shielding).
# "splitpush"       – 1v1 threat (Fiora, Tryndamere, Camille, Jax).
# ════════════════════════════════════════════════════════════════════

# Champion-specific kit pointers (key → mechanical kit notes). When the
# candidate has a famous, kit-specific interaction we want it called out
# by name. Only entries we want to surface — don't bloat this.
_CAND_KIT_VS_AUTOS = {
    "Nilah":     "Passif Nilah dodge les auto-attacks de {enemy}",
    "Jax":       "E Jax esquive complètement les auto-attacks de {enemy}",
    "Pantheon":  "W Pantheon bloque les auto-attacks de {enemy}",
    "Fiora":     "W Fiora parry les auto-attacks de {enemy}",
}

_CAND_KIT_VS_IMMOBILE = {
    "Nilah":     "E Nilah gap-close sur {enemy} sans risque de kite",
    "Yone":      "Q3 Yone knock-up engage {enemy} immobile",
    "Yasuo":     "Yasuo windwall + dash punit {enemy} immobile",
    "Zed":       "Zed all-in {enemy} sans escape",
    "Akali":     "Akali shroud + reset chain sur {enemy} immobile",
    "Rengar":    "Rengar one-shot {enemy} sans dash defensive",
    "Khazix":    "Khazix isolated jump sur {enemy} sans peel",
    "Malphite":  "R Malphite catch {enemy} sans dash",
    "Leona":     "E + R Leona lock down {enemy} immobile",
    "Camille":   "R Camille isole {enemy} sans escape",
}

_CAND_KIT_VS_ENGAGE = {
    "Caitlyn":   "Range Caitlyn (650) kite l'engage de {enemy}",
    "Ezreal":    "E Ezreal repositionne hors de l'engage de {enemy}",
    "Tristana":  "W Tristana saute hors de l'engage de {enemy}",
    "Lucian":    "E Lucian dodge l'engage de {enemy}",
    "Sivir":     "Spellshield Sivir bloque l'engage de {enemy}",
    "Janna":     "R Janna disengage l'engage de {enemy}",
    "Kassadin":  "R Kassadin évite l'engage de {enemy}",
}

_CAND_KIT_VS_SUSTAIN = {
    "MissFortune": "R MF + grievous wounds annule le sustain de {enemy}",
    "Varus":       "Varus blight stacks + grievous bypass le sustain de {enemy}",
    "Morgana":     "Q Morgana setup + grievous coupe le sustain de {enemy}",
    "Kled":        "Kled grievous wounds passif vs {enemy}",
}

# Generic archetype templates (used when no kit-specific entry fires).
# Order matters: the first matching pattern wins.
MATCHUP_REASONS: List[Tuple[str, str, str]] = [
    # (candidate_pattern, enemy_pattern, template)
    ("anti_auto",     "auto_attacker", "Kit anti-AA dénie les autos de {enemy}"),
    ("burst",         "immobile",      "Burst {cand} one-shot {enemy} sans escape"),
    ("gap_close",     "immobile",      "Gap-close {cand} colle à {enemy} sans risque"),
    ("kite",          "engage",        "Range {cand} kite l'engage de {enemy}"),
    ("disengage",     "engage",        "Disengage {cand} casse l'engage de {enemy}"),
    ("tank",          "burst",         "Tankiness {cand} mange le burst de {enemy}"),
    ("tank",          "engage",        "Frontline {cand} eat l'engage de {enemy}"),
    ("sustained_dps", "tank",          "DPS soutenu {cand} grignote {enemy}"),
    ("anti_heal",     "sustain",       "Grievous wounds {cand} annule le sustain de {enemy}"),
    ("cc_lockdown",   "poke",          "Lock-down {cand} punit la lane poke de {enemy}"),
    ("burst",         "squishy",       "Burst {cand} explose {enemy} squishy"),
    ("range_advantage","melee",        "Range {cand} harass {enemy} melee"),
]

# Synergy mechanical templates — same shape.
_ALLY_KIT_SYNERGY = {
    # ally_key → list of (cand_pattern, template)
    "Senna":     [("burst",     "Senna root setup les all-in de {cand}"),
                  ("dps",       "Senna shields + range double la DPS de {cand}")],
    "Leona":     [("burst",     "Leona E+R lock setup le burst de {cand}"),
                  ("dps",       "Leona stuns ouvrent la fenêtre DPS de {cand}")],
    "Malphite":  [("burst",     "R Malphite engage AOE pour {cand}"),
                  ("dps",       "R Malphite stun multi-target pour {cand}")],
    "Amumu":     [("burst",     "R Amumu AOE stun setup {cand}"),
                  ("dps",       "R Amumu lock teamfight pour {cand}")],
    "Yasuo":     [("burst",     "Knock-up ally → R Yasuo combo avec {cand}"),
                  ("dps",       "Windwall Yasuo couvre la DPS de {cand}")],
    "Yone":      [("burst",     "Q3 Yone setup les follow-up de {cand}")],
    "Lulu":      [("dps",       "Lulu peel + buff scale la DPS de {cand}")],
    "Janna":     [("dps",       "Janna shield/peel protège {cand}")],
    "Soraka":    [("dps",       "Soraka heal sustain les trades de {cand}")],
    "Lissandra": [("burst",     "R Lissandra freeze setup le burst de {cand}"),
                  ("engage",    "Lissandra engage à distance complète {cand}")],
    "Fiddlesticks":[("burst",   "R Fiddlesticks AOE fear chain avec {cand}"),
                    ("dps",     "R Fiddlesticks teamfight ouvre {cand}")],
    "DrMundo":   [("dps",       "Mundo frontline + grievous tape pour {cand}"),
                  ("burst",     "Mundo soaks vs counter-engage de {cand}")],
}

SYNERGY_REASONS: List[Tuple[str, str, str]] = [
    ("burst",     "engage",   "Engage {ally} ouvre le burst de {cand}"),
    ("dps",       "engage",   "Engage {ally} setup la DPS de {cand}"),
    ("dps",       "peel",     "Peel {ally} laisse {cand} DPS libre"),
    ("burst",     "cc",       "CC {ally} lock pour le burst de {cand}"),
    ("dps",       "cc",       "CC {ally} ouvre la fenêtre DPS de {cand}"),
    ("squishy_carry", "tank", "Frontline {ally} protège {cand}"),
    ("poke",      "poke",     "Poke combiné {ally} + {cand}"),
    ("teamfight", "teamfight","Teamfight stack avec {ally}"),
    ("splitpush", "teamfight","{ally} split, {cand} force 4v4"),
]


# ── Pattern matchers ─────────────────────────────────────────────────
def _cand_patterns(cand: Champion) -> set:
    """Set of mechanical labels that describe the candidate's kit."""
    p: set = set()
    c = cand.ratings
    tags = set(cand.tags)

    if cand.key in _CAND_KIT_VS_AUTOS or (c.utility >= 4 and "Marksman" not in tags):
        p.add("anti_auto")
    if c.burst >= 4 or "Assassin" in tags:
        p.add("burst")
    if c.engage >= 4:
        p.add("gap_close")
    if "Marksman" in tags and c.dps >= 4:
        p.add("kite")
        p.add("range_advantage")
    if c.utility >= 4 and ("Mage" in tags or "Support" in tags):
        p.add("disengage")
    if c.tankiness >= 4 or "Tank" in tags:
        p.add("tank")
    if c.dps >= 4:
        p.add("sustained_dps")
        p.add("dps")
    if cand.key in _CAND_KIT_VS_SUSTAIN or cand.key in {"Morgana", "Varus", "MissFortune", "Kled"}:
        p.add("anti_heal")
    if c.cc >= 4 and (c.engage >= 4 or c.tankiness >= 3):
        p.add("cc_lockdown")
    if c.poke >= 4:
        p.add("poke")
    if "Fighter" in tags and c.splitpush >= 4:
        p.add("splitpush")
    if c.teamfight >= 4:
        p.add("teamfight")
    if "Marksman" in tags and c.tankiness <= 2:
        p.add("squishy_carry")
    return p


def _enemy_patterns(enemy: Champion) -> set:
    """Set of mechanical labels for the enemy."""
    p: set = set()
    o = enemy.ratings
    tags = set(enemy.tags)

    if "Marksman" in tags or (o.dps >= 4 and o.burst <= 3 and "Mage" not in tags):
        p.add("auto_attacker")
    if o.tankiness <= 2 and "Marksman" in tags:
        p.add("immobile")
    if o.engage >= 4:
        p.add("engage")
    if o.tankiness <= 2 and "Tank" not in tags:
        p.add("squishy")
    if o.poke >= 4 and "Marksman" not in tags:
        p.add("poke")
    if o.burst >= 4 or "Assassin" in tags:
        p.add("burst")
    if o.tankiness >= 4 or "Tank" in tags:
        p.add("tank")
    if enemy.key in {"Soraka", "Yuumi", "Sona", "Aatrox", "Vladimir", "DrMundo", "Zac", "Senna"}:
        p.add("sustain")
    if "Fighter" in tags and "Marksman" not in tags and o.tankiness >= 2:
        p.add("melee")
    return p


def _ally_patterns(ally: Champion) -> set:
    """Set of mechanical labels the ally provides for synergy matching."""
    p: set = set()
    a = ally.ratings
    tags = set(ally.tags)
    if a.engage >= 4:
        p.add("engage")
    if a.cc >= 4:
        p.add("cc")
    if a.utility >= 4:
        p.add("peel")
    if a.tankiness >= 4 or "Tank" in tags:
        p.add("tank")
    if a.poke >= 4:
        p.add("poke")
    if a.teamfight >= 4:
        p.add("teamfight")
    if a.splitpush >= 4:
        p.add("splitpush")
    return p


# ── Matchup reason (candidate vs one enemy) ──────────────────────────
# Threshold above which we are confident enough to claim a lane matchup.
LANE_CONFIDENCE_THRESHOLD = 0.7


def _matchup_reason(
    cand: Champion,
    enemy: Champion,
    delta: float,
    is_lane: bool,
    cand_role: Optional[str] = None,
    enemy_role: Optional[str] = None,
    lane_probability: float = 1.0,
) -> Optional[Dict]:
    """Return a Reason dict explaining the candidate's mechanical edge / risk
    vs this specific enemy. Priority order:

    1. Champion-specific kit interaction (Nilah passive, Jax E, Fiora W…).
    2. Generic mechanical archetype templates (MATCHUP_REASONS).
    3. Delta fallback ("+5 % vs X") — only when no mechanical rule fires.
    4. Warning when matchup is hard.

    `lane_probability` is the inferred probability that the enemy is in the
    candidate's role. We never claim "Lane favorable contre X" unless
    lane_probability ≥ LANE_CONFIDENCE_THRESHOLD (0.7).
    """
    en = enemy.name
    cn = cand.name
    c_pats = _cand_patterns(cand)
    e_pats = _enemy_patterns(enemy)

    # Strict same-lane check: both roles known, equal, AND inferred role is
    # confident. A flex pick like Naafiri (jgl 0.62 / mid 0.38) gets
    # "Matchup" wording even if argmax happened to be mid.
    same_lane = bool(
        is_lane
        and cand_role and enemy_role and cand_role == enemy_role
        and lane_probability >= LANE_CONFIDENCE_THRESHOLD
    )

    # ── 1. Champion-specific kit interactions ──
    if "auto_attacker" in e_pats and cand.key in _CAND_KIT_VS_AUTOS:
        return _mk(_CAND_KIT_VS_AUTOS[cand.key].format(enemy=en), "counter", en)
    if "immobile" in e_pats and cand.key in _CAND_KIT_VS_IMMOBILE:
        return _mk(_CAND_KIT_VS_IMMOBILE[cand.key].format(enemy=en), "counter", en)
    if "engage" in e_pats and cand.key in _CAND_KIT_VS_ENGAGE:
        return _mk(_CAND_KIT_VS_ENGAGE[cand.key].format(enemy=en), "counter", en)
    if "sustain" in e_pats and cand.key in _CAND_KIT_VS_SUSTAIN:
        return _mk(_CAND_KIT_VS_SUSTAIN[cand.key].format(enemy=en), "counter", en)

    # ── 2. Generic mechanical archetype templates ──
    for cand_pat, enemy_pat, template in MATCHUP_REASONS:
        if cand_pat in c_pats and enemy_pat in e_pats:
            return _mk(template.format(cand=cn, enemy=en), "counter", en, cn)

    # ── 3. Delta fallback ──
    if delta >= 3.0:
        qual = "Lane" if same_lane else "Matchup"
        return _mk(f"{qual} favorable contre {en} (+{delta:.1f}%)", "counter", en)
    if delta <= -3.0:
        return _mk(f"Attention : {en} est un counter (-{abs(delta):.1f}%)", "warning", en)

    return None


def _ambiguity_reason(
    enemy: Champion,
    role_distribution: Dict[str, float],
    cand_role: str,
) -> Optional[Dict]:
    """Emit a reason flagging role ambiguity for a flex enemy.

    Fires when the enemy's max-probability role is < 0.85 (no single role
    is dominant). The text explains both scenarios so the user understands
    the matchup is conditional.
    """
    if not role_distribution:
        return None
    sorted_roles = sorted(role_distribution.items(), key=lambda x: -x[1])
    if not sorted_roles:
        return None
    best_role, best_p = sorted_roles[0]
    if best_p >= 0.85:
        return None  # not ambiguous

    en = enemy.name
    role_lbl = {
        "top": "top", "jungle": "jungle", "mid": "mid",
        "bot": "ADC", "support": "sup",
    }
    best_lbl = role_lbl.get(best_role, best_role)

    if best_role == cand_role:
        # Lane probable, but enough off-role probability to flag it
        text = (
            f"{en} probable {best_lbl} ({int(best_p*100)}%) — "
            f"matchup direct lane mais incertain"
        )
    else:
        # Off-role most likely, but still some lane risk
        lane_p = role_distribution.get(cand_role, 0.0)
        if lane_p >= 0.20:
            text = (
                f"{en} probable {best_lbl} ({int(best_p*100)}%) "
                f"— sinon lane ({int(lane_p*100)}%), matchup wider, pas direct lane"
            )
        else:
            text = (
                f"{en} probable {best_lbl} ({int(best_p*100)}%) — "
                f"pas d'impact direct lane"
            )
    return _mk(text, "info", en)


# ── Synergy reason (candidate alongside one ally) ────────────────────
def _synergy_reason(
    cand: Champion,
    ally: Champion,
    ally_role: Optional[str],
    cand_role: str,
    delta: float,
) -> Optional[Dict]:
    """Mechanical synergy reasoning. Same priority logic as matchup:

    1. Ally-specific kit pointer (Senna roots, Leona stuns, Lulu peel…).
    2. Generic candidate-pattern × ally-pattern templates.
    3. Delta fallback.
    """
    an = ally.name
    cn = cand.name
    c_pats = _cand_patterns(cand)
    a_pats = _ally_patterns(ally)

    # ── 1. Ally-specific kit pointers ──
    if ally.key in _ALLY_KIT_SYNERGY:
        for cand_pat, template in _ALLY_KIT_SYNERGY[ally.key]:
            if cand_pat in c_pats:
                return _mk(template.format(ally=an, cand=cn), "synergy", an, cn)

    # ── 2. Generic mechanical synergy templates ──
    for cand_pat, ally_pat, template in SYNERGY_REASONS:
        if cand_pat in c_pats and ally_pat in a_pats:
            return _mk(template.format(ally=an, cand=cn), "synergy", an, cn)

    # ── 3. Delta fallback ──
    if delta >= 3.0:
        return _mk(f"Bon fit avec {an}", "synergy", an)

    return None


# ── Composition fillers ──────────────────────────────────────────────
def _composition_reasons(
    cand: Champion,
    team: List[Champion],
    comp_summary: Optional[Dict],
) -> List[Dict]:
    reasons: List[Dict] = []
    if not team:
        return reasons

    c = cand.ratings
    c_tags = set(cand.tags)

    # Damage diversity — based on team WITHOUT candidate
    if comp_summary:
        phys = comp_summary.get("damage_physical", 50.0)
        mag = comp_summary.get("damage_magical", 50.0)
        denom = phys + mag + 0.01
        ad_ratio = phys / denom
        if ad_ratio > 0.70 and cand.damage.magical >= 55:
            reasons.append(_mk("Apporte de l'AP dans une comp AD-heavy", "info"))
        elif ad_ratio < 0.30 and cand.damage.physical >= 55:
            reasons.append(_mk("Apporte de l'AD dans une comp AP-heavy", "info"))

    # Missing frontline
    team_max_tank = max((t.ratings.tankiness for t in team), default=0)
    if team_max_tank < 3 and c.tankiness >= 4:
        reasons.append(_mk("Apporte le front manquant", "info"))

    # Missing engage
    team_max_engage = max((t.ratings.engage for t in team), default=0)
    if team_max_engage < 4 and c.engage >= 4:
        reasons.append(_mk("Seul engage fiable de l'équipe", "info"))

    # Immobile carry needs peel
    immobile_carry = next(
        (t for t in team if "Marksman" in t.tags and t.ratings.tankiness <= 2),
        None,
    )
    if immobile_carry and (c.utility >= 4 or (c.cc >= 4 and c.tankiness >= 3)):
        reasons.append(_mk(
            f"Peel pour protéger {immobile_carry.name}",
            "synergy",
            immobile_carry.name,
        ))

    # Missing CC
    team_cc_avg = sum(t.ratings.cc for t in team) / max(len(team), 1)
    if team_cc_avg < 2.5 and c.cc >= 4:
        reasons.append(_mk("Comble le manque de CC", "info"))

    return reasons


# ── Reason list ──────────────────────────────────────────────────────
# Priority by kind when trimming to max_reasons.
# Lower score = surfaces first.
_KIND_PRIORITY = {"synergy": 0, "counter": 0, "warning": 1, "info": 2}


def _specificity(r: Dict) -> int:
    """Higher specificity = mechanical reason, lower = generic delta filler.

    0  – champion-name kit reason (Nilah passive, Senna roots…) — most specific.
    1  – mechanical archetype reason (any reason mentioning a champion).
    2  – delta-only fallback (text starts with "Lane favorable" / "Matchup
         favorable" / "Bon fit avec" / "Attention").
    3  – composition filler (no champions referenced, kind = "info").
    """
    text = r.get("text", "")
    champs = r.get("champions") or []
    kind = r.get("kind", "")

    if kind == "info" and not champs:
        return 3
    # Ambiguity reasons (mention a champion + probability) are mid-tier
    # information — surface above generic delta fallback when relevant
    if kind == "info" and champs and "%" in text and "probable" in text:
        return 2
    # Delta fallback templates — recognisable opening words
    if any(text.startswith(p) for p in (
        "Lane favorable", "Matchup favorable", "Bon fit avec", "Attention :"
    )):
        return 2
    # Composition reasons mention a champion ("Peel pour protéger Caitlyn")
    if kind in ("synergy", "counter") and champs:
        return 1
    return 1


def generate_reasons(
    cand: Champion,
    role: str,
    draft: DraftState,
    db,
    matchup_details: List[Dict],
    synergy_details: List[Dict],
    comp_summary: Optional[Dict] = None,
    max_reasons: int = 3,
) -> List[Dict]:
    """Return up to ``max_reasons`` Reason dicts. Mechanical / champion-
    specific reasons always win over generic delta fallbacks when trimming.
    """
    out: List[Dict] = []
    seen_text: set = set()

    def _add(r: Optional[Dict]) -> None:
        if not r:
            return
        t = r["text"]
        if t in seen_text:
            return
        out.append(r)
        seen_text.add(t)

    # 1. Matchups — lane opponent first, then highest |delta|
    enemy_filled = [ep for ep in draft.enemy_picks if ep.champion_id is not None]
    role_dists = getattr(draft, "role_distributions", {}) or {}
    for pick, mu in sorted(
        zip(enemy_filled, matchup_details),
        key=lambda p: (
            0 if p[1].get("is_lane_opponent") else 1,
            -abs(p[1].get("delta", 0.0)),
        ),
    ):
        enemy = db.get_by_id(pick.champion_id)
        if enemy:
            lane_p = mu.get("lane_probability")
            if lane_p is None:
                lane_p = 1.0 if mu.get("is_lane_opponent") else 0.0
            _add(_matchup_reason(
                cand, enemy, mu.get("delta", 0.0),
                mu.get("is_lane_opponent", False),
                cand_role=role,
                enemy_role=pick.role,
                lane_probability=lane_p,
            ))
            # Surface ambiguity for flex enemies (max prob < 0.85)
            dist = mu.get("role_distribution") or role_dists.get(pick.champion_id) or {}
            _add(_ambiguity_reason(enemy, dist, role))

    # 2. Synergies — highest positive delta first
    ally_filled = [ap for ap in draft.ally_picks if ap.champion_id is not None]
    for pick, syn in sorted(
        zip(ally_filled, synergy_details),
        key=lambda p: -p[1].get("delta", 0.0),
    ):
        ally = db.get_by_id(pick.champion_id)
        if ally:
            _add(_synergy_reason(
                cand, ally, pick.role, role, syn.get("delta", 0.0),
            ))

    # 3. Composition fillers
    team = [
        db.get_by_id(ap.champion_id)
        for ap in draft.ally_picks
        if ap.champion_id is not None
    ]
    team = [t for t in team if t]
    for r in _composition_reasons(cand, team, comp_summary):
        _add(r)

    # Trim — stable sort by (kind priority, specificity).
    # Most specific mechanical reasons surface first, generic delta lines
    # only fill the remaining slots.
    out.sort(key=lambda r: (_KIND_PRIORITY.get(r["kind"], 3), _specificity(r)))
    return out[:max_reasons]


# ── Verdict: one-line summary ────────────────────────────────────────
def generate_verdict(
    cand: Champion,
    draft: DraftState,
    db,
    match_s: float,
    syn_s: float,
    comp_s: float,
    risk_s: float,
    tags: Optional[List[str]] = None,
    is_pool: bool = True,
) -> str:
    """Produce a 1-2 clause verdict line that mentions the concrete
    lane opponent / top synergy ally when relevant.

    Shape: "<main phrase>[. <secondary caution>]" — secondary is added
    only when it adds new information (e.g. strong first pick is safe,
    but the enemy team archetype is risky).
    """
    tags = tags or []

    # ── Read the draft context ──
    enemies_filled = [e for e in draft.enemy_picks if e.champion_id is not None]
    allies_filled = [a for a in draft.ally_picks if a.champion_id is not None]
    is_last_pick = draft.is_last_pick
    is_first_pick = draft.my_pick_order == 1 and not enemies_filled

    lane_opp_name: Optional[str] = None
    for ep in enemies_filled:
        if ep.role == draft.my_role:
            c = db.get_by_id(ep.champion_id)
            if c:
                lane_opp_name = c.name
                break

    # Top synergy ally by ratings heuristic (engage/utility/tank/CC ally
    # that matters most for this candidate). Simple rule: prefer an
    # engage / CC / utility ally whose ratings align with the candidate.
    top_ally_name: Optional[str] = None
    best_score = 0
    for ap in allies_filled:
        ally = db.get_by_id(ap.champion_id)
        if not ally:
            continue
        s = 0
        a = ally.ratings
        c = cand.ratings
        if a.engage >= 4 and (c.dps >= 4 or c.burst >= 4):
            s += 3
        if a.cc >= 4 and (c.dps >= 4 or c.burst >= 4):
            s += 2
        if "Marksman" in cand.tags and ap.role == "support" and (a.utility >= 4 or a.engage >= 4):
            s += 3
        if a.tankiness >= 4 and c.tankiness <= 2:
            s += 2
        if s > best_score:
            best_score = s
            top_ally_name = ally.name

    # ── Main phrase — pick the first rule that matches ──
    main: str
    if not is_pool:
        # Off-pool / "secret" pick — surface it clearly
        if match_s >= 60 and lane_opp_name:
            main = f"Secret pick — punit {lane_opp_name}."
        elif match_s >= 60:
            main = "Secret pick — matchup en ta faveur."
        elif "meta-forte" in tags:
            main = "Secret pick — meta-S hors pool."
        else:
            main = "Secret pick — écart de score notable."
    elif is_last_pick and match_s >= 62 and lane_opp_name:
        main = f"Counter direct en last pick sur {lane_opp_name}."
    elif is_last_pick:
        main = "Last pick informé — exploite la draft ennemie."
    elif match_s >= 65 and lane_opp_name:
        main = f"Counter direct {lane_opp_name}."
    elif match_s >= 65 and enemies_filled:
        main = "Matchup très favorable sur la comp ennemie."
    elif is_first_pick and risk_s >= 72:
        main = "Safe blind — peu counter-prone, flex."
    elif is_first_pick:
        main = "Blind pick — attention au counter."
    elif syn_s >= 64 and top_ally_name:
        main = f"Synergie forte avec {top_ally_name}."
    elif syn_s >= 64 and allies_filled:
        main = "Synergie d'équipe au-dessus de la moyenne."
    elif "meta-forte" in tags:
        main = "Meta-S du patch."
    elif comp_s >= 72:
        main = "Équilibre la compo."
    elif match_s < 42 and lane_opp_name:
        main = f"Matchup difficile contre {lane_opp_name}."
    else:
        main = "Pick solide."

    # ── Secondary caution — only add when it adds info ──
    secondary: Optional[str] = None
    # Hard counter warning when main is positive
    if match_s < 42 and enemies_filled and "Counter" not in main and "Matchup difficile" not in main:
        secondary = "Matchup tendu."
    # Risky blind but main wasn't about blind
    elif risk_s < 40 and enemies_filled and "blind" not in main.lower() and "Counter" not in main:
        secondary = "Exposition aux counters."
    # Great synergy bonus when the main phrase is about matchup
    elif syn_s >= 62 and top_ally_name and top_ally_name not in main and "Counter" in main:
        secondary = f"Bonus synergie avec {top_ally_name}."

    return f"{main} {secondary}" if secondary else main
