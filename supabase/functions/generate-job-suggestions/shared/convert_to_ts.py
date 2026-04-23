import os
import glob
import json

source_dir = r"c:\Users\Isaac\OneDrive\Documents\GetaJob\Libraries"
dest_dir = r"c:\Users\Isaac\OneDrive\Documents\GetaJob\Get-a-Job\functions\shared\libraries"

os.makedirs(dest_dir, exist_ok=True)

for file in glob.glob(os.path.join(source_dir, "*.json")):
    basename = os.path.basename(file)
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Clean up variable name from something like 00_role_library.json -> roleLibrary
    # or 010_agent_decision_logic.json -> agentDecisionLogic
    name_parts = basename.replace('.json', '').split('_')
    # drop leading numbers
    parts = [p for p in name_parts if not p.isdigit()]
    var_name = parts[0].lower() + ''.join(word.capitalize() for word in parts[1:])
    
    # Try parsing, just to be clean
    try:
        parsed = json.loads(content)
        export_string = f"export const {var_name} = " + json.dumps(parsed, indent=2) + ";\n"
    except Exception:
        # Fallback to pure string export if it failed parsing (like tier_logic)
        escaped_content = content.replace('`', '\\`')
        export_string = f"export const {var_name} = `{escaped_content}`;\n"
        
    ts_file = os.path.join(dest_dir, basename.replace('.json', '.ts'))
    with open(ts_file, 'w', encoding='utf-8') as f:
        f.write(export_string)
        
    print(f"Created {ts_file} exporting {var_name}")
