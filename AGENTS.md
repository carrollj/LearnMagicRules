# Workspace Commands

Common commands for working in this repository.

## Parse and Rebuild Output

- Build markdown chunks and regenerate site data:
  - `python .\parse_comprehensive_rules.py`

## Run Local Site

- Start the local rules browser from the generated output folder:
  - `Set-Location "c:\Users\Justin\Documents\LearnMagicRules\rules-site"; python -m http.server 8765`
- Stop the local server on port 8765:
  - `$serverPids = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($serverPids) { Stop-Process -Id $serverPids -Force }`
  - If this fails with a permission error, ask the user to terminate any server instances they manually started before continuing.
- Open in browser:
  - `http://127.0.0.1:8765/`

## Agent Workflow (Parse -> Serve -> Browse)

1. Terminate any currently running site server first:
  - `$serverPids = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($serverPids) { Stop-Process -Id $serverPids -Force }`
  - If this fails with a permission error, ask the user to terminate any server instances they manually started before continuing.
2. Rebuild output:
  - `python .\parse_comprehensive_rules.py`
3. Start the site server as a detached process so it keeps running after the agent is done:
  - `Start-Process python -ArgumentList '-m','http.server','8765' -WorkingDirectory 'c:\Users\Justin\Documents\LearnMagicRules\rules-site'`
4. Browse the site:
  - `http://127.0.0.1:8765/`

## Useful PowerShell Navigation

- Go to repo root:
  - `Set-Location "c:\Users\Justin\Documents\LearnMagicRules"`
- Go to generated site folder:
  - `Set-Location ".\rules-site"`

## Quick Checks

- Verify parser script exists:
  - `Test-Path .\parse_comprehensive_rules.py`
- List generated data files:
  - `Get-ChildItem .\rules-site\data`
