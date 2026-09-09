"""Explain which extra champion adds tools missing from a player's role pool."""
from app.services.mechanics import MechanicsAnalyzer

LABELS = {
    "magic_damage": "dégâts magiques", "physical_damage": "dégâts physiques",
    "frontline": "première ligne", "engage": "initiation", "range": "portée / poke",
    "peel": "protection du carry", "anti_mobility": "réponse à la mobilité",
    "anti_tank": "réponse aux gros PV", "anti_attacks": "réponse aux attaques",
}
ROLE_NEEDS = {
    "top": {"magic_damage": 2, "physical_damage": 1, "frontline": 3, "engage": 2, "anti_tank": 2, "anti_attacks": 1},
    "jungle": {"magic_damage": 2, "physical_damage": 1, "frontline": 2, "engage": 3, "anti_mobility": 2},
    "mid": {"magic_damage": 2, "physical_damage": 1, "range": 3, "engage": 1, "anti_mobility": 2},
    "bot": {"magic_damage": 1, "physical_damage": 2, "range": 3, "anti_tank": 3, "anti_attacks": 1},
    "support": {"frontline": 2, "engage": 3, "range": 1, "peel": 3, "anti_mobility": 2},
}


def advise_pool(db, role, entries):
    analyzer = MechanicsAnalyzer(db)
    champions = [c for e in entries if (c := db.get_by_id(e.champion_id))]
    ids = {c.id for c in champions}
    covered = set().union(*(analyzer.coverage(c) for c in champions)) if champions else set()
    priorities = ROLE_NEEDS[role]
    gaps = set(priorities) - covered
    suggestions = []
    for c in db.champions_for_role(role):
        if c.id in ids:
            continue
        tools = analyzer.coverage(c)
        adds = gaps & tools
        if not adds:
            continue
        score = sum(priorities[k] for k in adds)
        familiar = max((len(tools & analyzer.coverage(p)) for p in champions), default=0)
        suggestions.append({"champion_id": c.id, "champion_key": c.key, "champion_name": c.name,
                            "adds": [LABELS[k] for k in sorted(adds)], "coverage_gain": score,
                            "familiar_tools": familiar,
                            "reason": f"Ajoute {', '.join(LABELS[k] for k in sorted(adds))} à ton pool {role}.",
                            "learning_plan": ["Apprendre les échanges et les limites du kit en partie normale.",
                                              "Tester ce champion dans les drafts où ce manque apparaît.",
                                              "Revoir quelques parties avant de réévaluer ton niveau de maîtrise."]})
    suggestions.sort(key=lambda s: (-s["coverage_gain"], -s["familiar_tools"], s["champion_name"]))
    return {"role": role, "pool_size": len(ids), "covered": [LABELS[k] for k in sorted(covered)],
            "gaps": [LABELS[k] for k in sorted(gaps)], "suggestions": suggestions[:3],
            "method": "Complémentarité des outils du kit et des profils de champions ; aucun gain de win rate promis.",
            "note": "Chaque champion n'a pas à tout faire : ce sont des options de draft, pas des obligations de composition."}
