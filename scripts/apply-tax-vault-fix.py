"""One-off repository migration: fail closed if source no longer matches."""
from pathlib import Path

path = Path("backend/app/main.py")
source = path.read_text(encoding="utf-8")
replacements = (
    (
        '        vault.password_wrapped_key = tax_seal({"key": data_key.hex()}, data_key)\n',
        '        # Legacy vaults without a wrapper derive their data key from the password.\n'
        '        # Never replace an existing password-derived wrapper with a data-key wrapper.\n'
        '        if not vault.password_wrapped_key:\n'
        '            vault.password_wrapped_key = tax_seal({"key": data_key.hex()}, data_key)\n',
    ),
    (
        '        restore_backup(session, parsed, files, vault)\n    return {"restored": True}\n',
        '        restore_backup(session, parsed, files, vault)\n'
        '        # A restored vault can have a different encryption key. Expire every old token.\n'
        '        TAX_SESSIONS.clear()\n'
        '    return {"restored": True}\n',
    ),
)
for old, new in replacements:
    if source.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence: {old[:70]!r}")
    source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
