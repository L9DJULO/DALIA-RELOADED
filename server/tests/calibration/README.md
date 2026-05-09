# DALIA — Calibration Suite

Regression tests for the recommendation engine. Loads scenarios from
`cases.json`, calls `DraftEngine.recommend` directly (no HTTP), and verifies
that the rankings meet the expected assertions. Useful to detect regressions
when you tune weights or scoring logic in `app/services/draft_engine.py`.

## How to run

From the `server/` directory (so the `app` package and venv are in scope):

```bash
cd server
python tests/calibration/run_calibration.py
```

Useful flags:

| Flag | Effect |
|------|--------|
| `-v`, `--verbose` | Show the top 5 recommendations of each case + every passed assertion |
| `-f <category>`, `--filter <category>` | Run only cases of a given category (`blind_pick`, `counter`, `anti_autoattack`, `anti_engage`, `synergy`, `pool_restricted`, `pick_order`) |
| `--cases <path>` | Use a custom cases JSON file |

The script returns exit code **0** when every assertion passes, **1** otherwise
(plug it into CI later when the suite is stable).

> ⚠️ The first run hits Data Dragon + Lolalytics over the network. Subsequent
> runs read from the on-disk cache in `server/app/data/cache/`.

## Adding a new case

Append an object to `cases.json` with this shape:

```json
{
  "id": "blind_pick_adc_safe",
  "category": "blind_pick",
  "description": "ADC en blind pick first, doit privilégier safe/flex",
  "confidence": "low",
  "setup": {
    "my_team": "blue",
    "my_role": "adc",
    "my_pick_order": 1,
    "ally_picks": {"top": "Malphite"},
    "enemy_picks": {},
    "bans": [],
    "champion_pool": {
      "adc": [
        {"champion": "Caitlyn", "tier": "S"},
        {"champion": "Ezreal",  "tier": "A"}
      ]
    }
  },
  "assertions": [
    {"type": "must_be_in_top_3", "champion": "Caitlyn"},
    {"type": "must_not_be_top_3", "champion": "Yasuo"},
    {"type": "must_rank_higher_than", "champion_a": "Caitlyn", "champion_b": "Aphelios"}
  ]
}
```

### Field notes

- `id` — unique slug, shown in the report.
- `category` — used to bucket the report; pick an existing one or invent a new one.
- `confidence` — optional (`low` / `medium` / `high`). Marks shaky expectations
  so a failure here is less damning. Shown in the report next to the case id.
- `setup.my_role` / role keys in pools and picks accept aliases (`adc`, `bot`,
  `bottom`, `mid`, `middle`, `support`, `supp`, `sup`, `jg`, `jungle`, `top`).
- `setup.champion_pool` — pass `null` (or omit) to use every champion in the
  role at tier `D`. Otherwise restrict to the listed entries.
- Champion names are matched against display name then DDragon key, with
  apostrophes/spaces stripped (`"Kog'Maw"`, `"KogMaw"`, and `"kog'maw"` all work).

### Assertion types

| Type | Fields | Meaning |
|------|--------|---------|
| `must_be_top_1` | `champion` | Champion must be #1 in the recommendations |
| `must_be_in_top_3` | `champion` | Champion must be in indices 0..2 |
| `must_be_in_top_5` | `champion` | Champion must be in indices 0..4 |
| `must_not_be_top_3` | `champion` | Champion must be absent from indices 0..2 (absent from top 15 also passes) |
| `must_rank_higher_than` | `champion_a`, `champion_b` | `a` must rank strictly higher than `b`. If `b` is absent from the top 15 entirely, this passes. If `a` is absent, this fails. |
| `must_have_score_above` | `champion`, `min_score` | Champion's `total_score` must be ≥ `min_score` |

When in doubt about an expectation, prefer `must_rank_higher_than` between two
contrasted champions over an absolute "must be top 1" — relative claims are
much more robust to meta drift than absolute ones.

## Reading the report

```
✓ blind_pick_adc  (3/3)
  ADC blind pick — safe ranged ADCs over high-risk hyper carries
  …

✗ comp_full_aa_bot_nilah  (0/1) [confidence:medium]
  Bot vs full auto-attack enemy comp — Nilah (passive vs AAs) should rise
  ✗ must_be_in_top_3: Nilah is #6, expected ≤ 3
  …

═══════════════════════════════════════════════════════════
By category:
  anti_autoattack         3/4   ( 75.0%)
  anti_engage             4/4   (100.0%)
  blind_pick              7/9   ( 77.8%)
  counter                 6/8   ( 75.0%)
  pick_order              2/3   ( 66.7%)
  pool_restricted         3/3   (100.0%)
  synergy                 1/2   ( 50.0%)

Global: 26/33 assertions passed (78.8%)
```

- A case prints its **id**, a count of `passed/total` assertions, and the
  failing ones with a reason.
- The footer shows per-category and global pass rate. Per-category numbers
  surface where the engine is weak (e.g. `synergy 50%` → revisit synergy
  weighting).
- Cases with `"confidence": "low"` are flagged in yellow — treat their
  failures as signals to investigate, not as hard regressions.

## Workflow for tuning weights

1. **Baseline** — run the suite, note the global score and per-category breakdown.
2. **Edit** — change a weight or rule in `app/services/draft_engine.py`
   (e.g. bump `HIGH_RISK_BLIND_PENALTY`, tweak the pick-order weight shaping,
   adjust the multi-counter bonus thresholds).
3. **Compare** — re-run, compare the new global + per-category scores.
4. **Iterate** — keep the change if the global went up *and* no category
   collapsed. Drop it if any category lost more than it gained — local
   improvements that crater another bucket are usually overfitting to a
   specific case rather than a real engine improvement.
5. **Add cases** — when you find a real-game scenario the engine got wrong,
   bake it into `cases.json` so future tuning can't silently regress on it.

The first run will be slow (network fetches); after that the cache makes
each iteration take a few seconds, which is the whole point of bypassing
HTTP.
