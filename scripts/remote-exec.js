const { spawn } = require('child_process');

const token = "FlyV1 fm2_lJPECAAAAAAAF9UJxBDaVwoxotQwoLk0t8N4Asz0wrVodHRwczovL2FwaS5mbHkuaW8vdjGUAJLOABzbeh8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxkvUIthRk4gdJoAvsFFOnJlyzMgXjjnMTdZ+UPRrsPxcdd7i+sukcQqbA8LW2lva5eqRFEnpjh/SCEh3jETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQgpkqMN3g/d6I9wcBcTzqINCjS1Fh73uuwxALL/vjNgag=,fm2_lJPETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQQCD+i+BhC3nxPL0gDBrN+V8O5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5qzxa7zpBnHNkXzgAbnX0Kkc4AG519DMQQeOJ11wqf0CMWV8EsineMHMQgsFmHxj5Lf6fJYmXZaRHeWn3981EdfrgkwFhneQjc0ZM=";
const app = process.argv[2] || "voop-webapp-db";
const cmd = process.argv[3] || "/usr/lib/postgresql/18/bin/psql -U postgres -p 5433 -d voop_webapp -c \"SELECT pg_size_pretty(pg_database_size('voop_webapp'));\"";

const proc = spawn('flyctl.exe', ['-t', token, 'ssh', 'console', '-a', app, '-C', cmd], {
  shell: false
});

proc.stdout.on('data', (d) => process.stdout.write(d));
proc.stderr.on('data', (d) => process.stderr.write(d));
proc.on('close', (code) => process.exit(code || 0));
