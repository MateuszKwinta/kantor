# Kantor — przelicznik walut na PLN

Prosty, jednoplikowy przelicznik walut z zapisem przeliczeń do notatnika i eksportem/importem CSV. Zaprojektowany jako aplikacja na ekran główny iPhone'a (PWA).

- **Kursy:** ExchangeRate-API (open.er-api.com) — referencyjne, nie transakcyjne
- **Cała apka w jednym pliku:** `index.html` (obok mały `sw.js`, który zapewnia start bez internetu)
- **Offline:** po pierwszym uruchomieniu z internetem apka startuje też bez sieci i pokazuje ostatni znany kurs (działa z opublikowanego adresu, nie z pliku otwartego lokalnie)
- **Notatnik:** wpisy trzymane lokalnie (localStorage); eksport i import przez plik CSV
- **Zależności:** tylko Google Fonts + API kursów

## Uruchomienie

Otwórz `index.html` w przeglądarce, albo wejdź na opublikowany adres GitHub Pages i w Safari na iPhonie wybierz *Udostępnij → Dodaj do ekranu głównego*.
