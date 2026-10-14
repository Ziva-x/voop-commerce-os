const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = "FlyV1 fm2_lJPECAAAAAAAF9UJxBDaVwoxotQwoLk0t8N4Asz0wrVodHRwczovL2FwaS5mbHkuaW8vdjGUAJLOABzbeh8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxkvUIthRk4gdJoAvsFFOnJlyzMgXjjnMTdZ+UPRrsPxcdd7i+sukcQqbA8LW2lva5eqRFEnpjh/SCEh3jETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQgpkqMN3g/d6I9wcBcTzqINCjS1Fh73uuwxALL/vjNgag=,fm2_lJPETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQQCD+i+BhC3nxPL0gDBrN+V8O5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5qzxa7zpBnHNkXzgAbnX0Kkc4AG519DMQQeOJ11wqf0CMWV8EsineMHMQgsFmHxj5Lf6fJYmXZaRHeWn3981EdfrgkwFhneQjc0ZM=";
const outputFile = path.join(__dirname, '..', 'scratch', 'voop_webapp_production_backup.sql');
const writeStream = fs.createWriteStream(outputFile);

console.log("Starting pg_dump stream from voop-webapp-db to:", outputFile);

const cmd = "/usr/lib/postgresql/18/bin/pg_dump -U postgres -p 5433 --clean --if-exists --no-owner --no-privileges voop_webapp";

const proc = spawn('flyctl.exe', ['-t', token, 'ssh', 'console', '-a', 'voop-webapp-db', '-C', cmd], {
  shell: false
});

let errorOutput = '';

proc.stdout.pipe(writeStream);
proc.stderr.on('data', (d) => {
  errorOutput += d.toString();
  process.stderr.write(d);
});

proc.on('close', (code) => {
  writeStream.close(() => {
    const stats = fs.statSync(outputFile);
    console.log(`\nDump completed with code ${code}. Total file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    process.exit(code || 0);
  });
});
