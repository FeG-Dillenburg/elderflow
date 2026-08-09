# Limit E2EE threat model to storage and passive infrastructure access

ElderFlow's end-to-end encryption will protect Protected text from stolen backups, direct database access, backend logs, and honest-but-curious infrastructure administrators. It will not claim protection from an administrator who maliciously changes the web client or from a compromised user device, because preventing those attacks would require a separately trusted client distribution boundary beyond the web application.
