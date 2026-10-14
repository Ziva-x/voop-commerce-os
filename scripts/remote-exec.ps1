$token = "FlyV1 fm2_lJPECAAAAAAAF9UJxBDaVwoxotQwoLk0t8N4Asz0wrVodHRwczovL2FwaS5mbHkuaW8vdjGUAJLOABzbeh8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxkvUIthRk4gdJoAvsFFOnJlyzMgXjjnMTdZ+UPRrsPxcdd7i+sukcQqbA8LW2lva5eqRFEnpjh/SCEh3jETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQgpkqMN3g/d6I9wcBcTzqINCjS1Fh73uuwxALL/vjNgag=,fm2_lJPETlO76jfjsMGurkXhUWOkURRgtSJkCBGod852M7WrQOlnbFpIxz96vP6jPDpv1nXCPPMJRBIQcZa1IjLqundfAzf3oWEoJqEyAZoQCBv/vMQQCD+i+BhC3nxPL0gDBrN+V8O5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5qzxa7zpBnHNkXzgAbnX0Kkc4AG519DMQQeOJ11wqf0CMWV8EsineMHMQgsFmHxj5Lf6fJYmXZaRHeWn3981EdfrgkwFhneQjc0ZM="
$app = if ($args[0]) { $args[0] } else { "voop-webapp-db" }
$cmd = if ($args[1]) { $args[1] } else { "echo test" }
$script = "export PATH=`$PATH:/usr/lib/postgresql/18/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/local/bin; $cmd`nexit`n"
$script | flyctl -t $token ssh console -a $app -q -C "sh"
