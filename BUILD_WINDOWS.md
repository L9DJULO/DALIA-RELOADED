# Build & Release Windows — DALIA

Guide pour les IAs qui reprennent ce projet. Cette VM Linux cross-compile un installeur Windows `.exe` via MinGW + NSIS.

## Prérequis déjà installés sur la VM

| Outil | État |
|---|---|
| Rust (`~/.cargo/bin`) | ✓ |
| Target Rust `x86_64-pc-windows-gnu` | ✓ |
| Cross-compilateur `x86_64-w64-mingw32-gcc` | ✓ |
| NSIS (`makensis`) | ✓ |
| Config Cargo (`~/.cargo/config.toml`) | ✓ |

> **Important** : `cargo` n'est pas dans le PATH par défaut. Toujours préfixer avec `PATH="$HOME/.cargo/bin:$PATH"`.

## Avant de builder : mettre à jour la version

Quand tu bumpes la version, elle doit être identique dans ces **3 fichiers** :

1. `client/package.json` → `"version": "X.Y.Z"`
2. `client/src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
3. `client/src-tauri/Cargo.toml` → `version = "X.Y.Z"`

## Commande de build

```bash
cd client
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build -- --target x86_64-pc-windows-gnu
```

L'exe produit se trouve à :
```
client/src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/DALIA_X.Y.Z_x64-setup.exe
```

Le build compile d'abord le frontend Vite (`npm run build`) puis Rust en cross-compilation. Durée : ~1-2 min (Rust met en cache les crates).

## Publier une release GitHub

Remote GitHub : `git@github.com:L9DJULO/DALIA-RELOADED.git`

### Créer ou écraser une release existante

```bash
# 1. Supprimer l'ancienne release + tag distant si besoin
gh release delete vX.Y.Z --repo L9DJULO/DALIA-RELOADED --yes
git push origin :refs/tags/vX.Y.Z

# 2. Re-pousser le tag local (ou en créer un nouveau)
git tag vX.Y.Z          # si pas encore tagué localement
git push origin vX.Y.Z

# 3. Créer la release avec l'exe
gh release create vX.Y.Z \
  "client/src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/DALIA_X.Y.Z_x64-setup.exe" \
  --repo L9DJULO/DALIA-RELOADED \
  --title "DALIA vX.Y.Z — ..." \
  --notes "..."
```

## Notes importantes

- Le build génère un warning sur la signature : normal, la signature d'installeur Windows n'est possible que depuis un host Windows. Le `.exe` fonctionne quand même.
- Le format MSI est ignoré en cross-compilation : seul NSIS (`.exe`) est produit. C'est suffisant.
- `~/.cargo/config.toml` contient la config du linker MinGW — ne pas supprimer.
