#!/bin/bash
cd /mnt/c/Users/Ordi/Desktop/TRAVAIL/PROJETPERSO/DALIA-RELOADED/server
LOG="tests/pro_concordance/scrape.log"
echo "=== Scrape loop démarré $(date) ===" >> $LOG

while true; do
  echo "--- Tentative $(date) ---" >> $LOG
  python3 tests/pro_concordance/scraper.py --leagues "LEC,LCK,LCS,LPL" --max-games 500 >> $LOG 2>&1
  EXIT=$?
  
  if [ $EXIT -eq 0 ]; then
    echo "✓ Scrape terminé avec succès $(date)" >> $LOG
    break
  fi
  
  echo "✗ Échec, retry dans 10 min..." >> $LOG
  sleep 600
done
