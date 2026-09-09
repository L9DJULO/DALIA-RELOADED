"""Argon2 for new passwords; verify legacy bcrypt hashes during migration."""
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
import bcrypt

_hasher = PasswordHasher()

def hash_password(plain: str) -> str:
    return _hasher.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        if hashed.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("ascii"))
        return _hasher.verify(hashed, plain)
    except (VerificationError, InvalidHashError, ValueError):
        return False

def needs_rehash(hashed: str) -> bool:
    return not hashed.startswith("$argon2") or _hasher.check_needs_rehash(hashed)
