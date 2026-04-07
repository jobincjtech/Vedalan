
AHM Fire Extinguisher Inspection System

Files:
- login.html → inspector login
- inspect.html → QR mobile form
- index.html → dashboard and CSV download
- data/equipment.json → imported from your uploaded extinguisher file
- backend/Code.gs → Apps Script backend
- fire_extinguisher_backend_setup.xlsx → helper workbook

Important:
GitHub Pages hosts static HTML, CSS, and JavaScript files, so it cannot itself store uploads or run server-side login. GitHub describes Pages as a static site hosting service, and Apps Script supports browser-facing web apps through doGet/doPost handlers. Use Apps Script for login, photo upload, and Google Sheets storage. citeturn828457search5turn828457search1

Your uploaded equipment file currently contains 105 extinguishers, not 100.
