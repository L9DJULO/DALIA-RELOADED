import json
import pytest
torch = pytest.importorskip('torch')
from app.ml.model import DraftNet
from app.ml.training_data import load_splits, PartialDraftDataset, FIELDS
from app.ml.train import calibrate, metrics
from app.ml.predictor import MLPredictor


def test_split_originals_before_masking_and_deduplicate(tmp_path):
    rows = [{**dict(zip(FIELDS, range(1, 11))), "match_id": f"EUW_{i}", "blue_win": i % 2, "patch": "16.17", "game_creation": 1000 + i} for i in range(100)]
    path = tmp_path / 'matches.jsonl'
    path.write_text('\n'.join(json.dumps(r) for r in rows + rows[:5]))
    splits, metadata = load_splits(path, '16.17')
    assert metadata['unique_matches'] == 100 and metadata['chronological']
    ids = [set(r['identity'] for r in part) for part in splits.values()]
    assert sum(map(len, ids)) == len(set.union(*ids))
    assert max(r['game_creation'] for r in splits['train']) < min(r['game_creation'] for r in splits['validation'])
    validation = PartialDraftDataset(splits['validation'])
    assert [(torch.cat(validation[i][:2]) != 0).sum().item() for i in range(4)] == [4, 6, 8, 10]


def test_padding_is_zero_even_with_projection_bias():
    model = DraftNet(embed_dim=4, hidden_dim=16)
    assert not torch.any(model.champion_embed.weight[0])
    with torch.no_grad(): model.role_proj[0].bias.fill_(1)
    assert not torch.any(model._embed_team(torch.zeros((1, 5), dtype=torch.long)))


def test_calibration_is_measured():
    logits = torch.tensor([8., -8., 8., -8.])
    labels = torch.tensor([1., 0., 0., 1.])
    temperature = calibrate(logits, labels)
    assert temperature != 5.
    assert metrics(logits, labels, temperature)['log_loss'] < metrics(logits, labels)['log_loss']


def test_legacy_model_cannot_supply_wpa(tmp_path, catalog):
    path = tmp_path / 'legacy.pt'
    torch.save({"model_state": DraftNet(embed_dim=4, hidden_dim=16).state_dict(), "embed_dim": 4, "hidden_dim": 16}, path)
    assert not MLPredictor(catalog, str(path)).is_available()
