from datetime import timedelta
import pytest
from pydantic import ValidationError
from app.models.draft import DraftRequest, DraftState, CompareRequest
from app.api.routes import PersonalStatsRequest
from app.auth.password import hash_password, verify_password, needs_rehash
from app.auth.jwt import create_access_token, decode_access_token, JWTError
from app.api.history_routes import HistoryResultUpdate


@pytest.mark.parametrize("body", [
    {"my_role": "adc"}, {"my_pick_order": 0}, {"bans": [0]}, {"bans": list(range(1, 12))},
    {"ally_picks": [{"champion_id": 1}], "enemy_picks": [{"champion_id": 1}]},
    {"bans": [1], "ally_picks": [{"champion_id": 1}]},
    {"ally_picks": [{"champion_id": 1, "role": "mid"}, {"champion_id": 2, "role": "mid"}]},
])
def test_invalid_drafts_rejected(body):
    with pytest.raises(ValidationError): DraftState(**body)


@pytest.mark.parametrize("weights", [{"typo": .5}, {"meta": float("nan")}, {"meta": -1}, {"meta": 8}, {"meta": 0}])
def test_invalid_weights_rejected(weights):
    with pytest.raises(ValidationError): DraftRequest(draft_state={}, weight_overrides=weights)


def test_path_traversal_and_unknown_queue_rejected():
    with pytest.raises(ValidationError): PersonalStatsRequest(puuid="../../../../x", region="EUW1")
    with pytest.raises(ValidationError): PersonalStatsRequest(puuid="valid-puuid-long", queue="custom")
    with pytest.raises(ValidationError): HistoryResultUpdate(result="victory")
    with pytest.raises(ValidationError): CompareRequest(draft_state={}, champion_ids=[1, 1])


def test_password_unicode_long_and_legacy_bcrypt():
    password = "é" * 80
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password(password + "x", hashed)
    assert not needs_rehash(hashed)
    import bcrypt
    legacy = bcrypt.hashpw(b"old-password", bcrypt.gensalt(rounds=4)).decode()
    assert verify_password("old-password", legacy) and needs_rehash(legacy)
    assert not verify_password("bad", legacy)


def test_jwt_expiry_signature_and_required_subject():
    token = create_access_token({"sub": "123"})
    assert decode_access_token(token)["sub"] == "123"
    with pytest.raises(JWTError): decode_access_token(token + "bad")
    with pytest.raises(JWTError): decode_access_token(create_access_token({"sub": "123"}, timedelta(seconds=-1)))
    with pytest.raises(JWTError): decode_access_token(create_access_token({}))
