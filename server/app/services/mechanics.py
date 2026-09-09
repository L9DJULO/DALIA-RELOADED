"""Curated kit interactions, distinct from observed win rates.

Scores are bounded design weights, not causal win-probability estimates.
Unknown champions never inherit mobility/attack traits from their Riot class.
"""
from app.models.draft import DraftState

REVIEWED_PATCH = "16.17"
SOURCE = "https://www.leagueoflegends.com/en-us/champions/"
# A champion may have both an interruptible dash and an unstoppable ability.
# Lists describe a particular ability, not blanket immunity/counters.
DASHES = {
    "Ahri": "R", "Akali": "E/R", "Camille": "E", "Diana": "E", "Ekko": "E (roulade)",
    "Fiora": "Q", "Gragas": "E", "Graves": "E", "Gwen": "E", "Irelia": "Q",
    "JarvanIV": "E-Q", "Kalista": "passif", "Kindred": "Q", "Leblanc": "W",
    "LeeSin": "Q/W", "Leona": "E", "Lucian": "E", "Nidalee": "W", "Nilah": "E",
    "Pantheon": "W", "Qiyana": "E", "Quinn": "E", "Rakan": "W/E", "Renekton": "E",
    "Riven": "Q/E", "Samira": "E", "Sejuani": "Q", "Shen": "E", "Sylas": "W/E",
    "Talon": "Q à distance", "Tristana": "W", "Tryndamere": "E", "Vayne": "Q",
    "Vi": "Q (pas R)", "MonkeyKing": "E", "XinZhao": "E", "Yasuo": "E", "Zac": "E",
}
BLINKS = {"Ezreal", "Kassadin", "Katarina", "Shaco", "Zed"}
AUTO = {"Ashe", "Aphelios", "Caitlyn", "Draven", "Jinx", "Kalista", "KogMaw", "Lucian",
        "Sivir", "Tristana", "Twitch", "Varus", "Vayne", "Xayah", "Zeri", "MasterYi",
        "Tryndamere", "Jax", "Irelia", "Yasuo", "Yone", "XinZhao", "Belveth"}
IMMOBILE_AUTO = {"Ashe", "Aphelios", "Draven", "Jinx", "KogMaw", "Sivir", "Twitch", "Varus"}
PEEL = {"Janna", "Alistar", "Milio", "Gragas", "Lulu", "Braum", "Thresh"}
KNOCKUPS = {"Alistar", "Blitzcrank", "Diana", "Gragas", "JarvanIV", "Malphite", "Nautilus",
            "Nami", "Ornn", "Rakan", "RekSai", "MonkeyKing", "XinZhao", "Yone", "Zac"}
BLOCKABLE_CC = {"Ashe", "Blitzcrank", "Elise", "Leona", "Lux", "Morgana", "Nautilus",
                "Thresh", "Sejuani", "TwistedFate", "Veigar"}
SUSTAIN = {"Aatrox", "Briar", "DrMundo", "Illaoi", "Maokai", "Soraka", "Swain", "Vladimir", "Warwick", "Yuumi", "Zac"}


class MechanicsAnalyzer:
    def __init__(self, db):
        self.db = db

    def evaluate(self, candidate, draft: DraftState):
        enemies = [c for p in draft.enemy_picks if (c := self.db.get_by_id(p.champion_id))]
        allies = [c for p in draft.ally_picks if (c := self.db.get_by_id(p.champion_id))]
        rules = []

        def add(rule, targets, points, text, caveat, kind="counter"):
            if not targets:
                return
            names = [c.name for c in targets]
            rules.append({"id": rule, "kind": kind, "score_delta": round(points, 1),
                          "text": text.format(targets=", ".join(names)), "champions": names,
                          "caveat": caveat, "source_url": SOURCE + candidate.key.lower() + "/",
                          "evidence": "kit_rule", "reviewed_patch": REVIEWED_PATCH})

        key = candidate.key
        if key == "Poppy":
            targets = [c for c in enemies if c.key in DASHES]
            abilities = ", ".join(f"{c.name} ({DASHES[c.key]})" for c in targets)
            add("poppy_interrupt_dash", targets, min(9, 3 * len(targets)),
                f"W peut interrompre les ruées de {abilities}, puis empêcher une nouvelle fuite.",
                "Il faut être à portée et garder W disponible. Ne bloque ni les téléportations ni les déplacements imparables.")
            add("poppy_blink_limit", [c for c in enemies if c.key in BLINKS], 0,
                "{targets} dispose d'une téléportation : ce déplacement ne déclenche pas l'arrêt de ruée de W.",
                "Le positionnement et les autres contrôles restent utiles.", "info")
        if key == "Nasus":
            targets = [c for c in enemies if c.key in IMMOBILE_AUTO]
            peel = [c for c in enemies if c.key in PEEL]
            lane = max((draft.role_distributions.get(c.id, {}).get(draft.my_role, 0) for c in targets), default=0)
            points = min(7, len(targets) * 2 + 2 * lane)
            add("nasus_wither_carry", targets, points,
                "W réduit déplacement et vitesse d'attaque de {targets}, qui n'a pas de ruée native pour s'éloigner.",
                "Avantage conditionnel : atteindre la portée de W et survivre au poke. Cela ne suffit pas à garantir la lane.")
            if targets:
                add("nasus_access_denied", peel, -min(points, 2 * len(peel)),
                    "{targets} peut repousser ou contrôler Nasus avant qu'il atteigne le carry.",
                    "Prévoir un accès par le flanc ou une initiation alliée ; le carry immobile peut rester inaccessible.", "warning")
        if key in {"Jax", "Nilah"}:
            targets = [c for c in enemies if c.key in AUTO]
            spell = "E" if key == "Jax" else "W"
            add("dodge_basic_attacks", targets, min(7, 2.5 * len(targets)),
                f"{spell} permet d'éviter temporairement les attaques de {{targets}}.",
                "Fenêtre courte : les sorts et les dégâts hors attaques restent une menace. Attendre ce sort change le duel.")
        if key == "Cassiopeia":
            add("ground_mobility", [c for c in enemies if c.key in DASHES or c.key in BLINKS],
                min(7, 2 * sum(c.key in DASHES or c.key in BLINKS for c in enemies)),
                "La zone de W peut empêcher {targets} d'utiliser ses déplacements tant qu'il reste dedans.",
                "Il faut poser la zone avant le déplacement ; ce n'est pas une interruption universelle d'une animation déjà lancée.")
        if key == "Morgana":
            add("black_shield_cc", [c for c in enemies if c.key in BLOCKABLE_CC],
                min(7, 2 * sum(c.key in BLOCKABLE_CC for c in enemies)),
                "E peut protéger un allié des contrôles de {targets}.",
                "Un seul allié à la fois ; la protection disparaît si les dégâts magiques détruisent le bouclier.")
        if key == "Yasuo":
            add("yasuo_knockup_followup", [c for c in allies if c.key in KNOCKUPS],
                min(7, 3 * sum(c.key in KNOCKUPS for c in allies)),
                "Les projections de {targets} offrent une fenêtre pour R sans devoir toucher ta propre tornade.",
                "L'allié doit toucher, et Yasuo doit pouvoir suivre à portée ; un pré-pick n'est pas un engagement confirmé.", "synergy")
        if key in {"Vayne", "Fiora", "Gwen", "KogMaw"}:
            targets = [c for c in enemies if c.is_tank]
            add("health_scaling_damage", targets, min(6, 2 * len(targets)),
                "Les dégâts liés aux PV de la cible donnent une réponse aux PV élevés de {targets}.",
                "Il faut pouvoir appliquer plusieurs attaques ou sorts ; le contrôle et la portée peuvent empêcher ces dégâts.")
        if key in {"Varus", "Katarina", "Kled"}:
            add("kit_grievous_wounds", [c for c in enemies if c.key in SUSTAIN],
                min(5, 2 * sum(c.key in SUSTAIN for c in enemies)),
                "Le kit dispose d'une réduction des soins utile contre {targets}.",
                "Condition d'application propre au sort ; cela ne supprime ni les boucliers ni toute la régénération.")
        delta = max(-12.0, min(12.0, sum(r["score_delta"] for r in rules)))
        return delta, rules

    def coverage(self, champion):
        """Pool dimensions represent explicit tools or reviewed attribute ratings."""
        r = champion.ratings
        result = set()
        if champion.damage.magical >= 60: result.add("magic_damage")
        if champion.damage.physical >= 60: result.add("physical_damage")
        if r.tankiness >= 4: result.add("frontline")
        if r.engage >= 4 and r.cc >= 3: result.add("engage")
        if r.poke >= 4: result.add("range")
        if champion.key in PEEL or champion.key == "Morgana": result.add("peel")
        if champion.key in {"Poppy", "Cassiopeia"}: result.add("anti_mobility")
        if champion.key in {"Vayne", "Fiora", "Gwen", "KogMaw", "Varus"}: result.add("anti_tank")
        if champion.key in {"Jax", "Nilah", "Nasus", "Rammus", "Malphite"}: result.add("anti_attacks")
        return result
