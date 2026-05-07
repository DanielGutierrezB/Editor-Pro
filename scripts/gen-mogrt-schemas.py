#!/usr/bin/env python3
"""
Generate mogrts/schemas.json from all .mogrt files in mogrts/
Run this whenever you add/modify MOGRT files.
Usage: python3 scripts/gen-mogrt-schemas.py
"""
import json, os, sys, zipfile

TYPE_MAP = {1:'checkbox', 2:'slider', 4:'color', 6:'text', 10:'group', 13:'dropdown'}

def extract_schema(mogrt_path):
    """Extract property schema from a .mogrt ZIP file."""
    with zipfile.ZipFile(mogrt_path) as zf:
        with zf.open('definition.json') as df:
            defn = json.loads(df.read().decode('utf-8'))
    
    props = []
    for ctrl in defn.get('clientControls', []):
        t = ctrl.get('type', -1)
        if t == 10:  # group — skip
            continue
        
        tname = TYPE_MAP.get(t, 'unknown')
        name = ctrl.get('uiName', {}).get('strDB', [{}])[0].get('str', '')
        if not name:
            continue
        
        prop = {'name': name, 'type': tname, 'id': ctrl.get('id', '')}
        
        if tname == 'slider':
            prop['min'] = ctrl.get('min', 0)
            prop['max'] = ctrl.get('max', 100)
            prop['default'] = ctrl.get('value', 0)
        elif tname == 'color':
            vals = ctrl.get('value', [1,1,1,1])
            if isinstance(vals, list) and len(vals) >= 3:
                prop['default'] = '#{:02x}{:02x}{:02x}'.format(
                    int(vals[0]*255), int(vals[1]*255), int(vals[2]*255))
            else:
                prop['default'] = '#ffffff'
        elif tname == 'checkbox':
            prop['default'] = ctrl.get('value', False)
        elif tname == 'dropdown':
            opts = [m.get('strDB', [{}])[0].get('str', '') for m in ctrl.get('menucontent', [])]
            prop['options'] = opts
            prop['default'] = ctrl.get('value', 0)
        elif tname == 'text':
            fe = ctrl.get('fonteditinfo', {})
            prop['font'] = fe.get('fontEditValue', '')
            prop['fontSize'] = fe.get('fontSizeEditValue', 0)
            prop['faux'] = {
                'bold': fe.get('fontFSBoldValue', False),
                'italic': fe.get('fontFSItalicValue', False),
                'allCaps': fe.get('fontFSAllCapsValue', False),
                'smallCaps': fe.get('fontFSSmallCapsValue', False)
            }
        
        props.append(prop)
    
    return {
        'capsuleName': defn.get('capsuleName', ''),
        'properties': props,
        'effects': defn.get('usedEffects', []),
        'fonts': defn.get('usedFontsLocalized', {}).get('en_US', []),
        'duration': defn.get('sourceInfoLocalized', {}).get('en_US', {}).get('duration', {}).get('value', 6)
    }

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_dir = os.path.dirname(script_dir)
    mogrt_dir = os.path.join(repo_dir, 'mogrts')
    out_path = os.path.join(mogrt_dir, 'schemas.json')
    
    schemas = {}
    for fname in sorted(os.listdir(mogrt_dir)):
        if not fname.endswith('.mogrt'):
            continue
        mogrt_type = fname.replace('.mogrt', '').upper()
        fpath = os.path.join(mogrt_dir, fname)
        try:
            schemas[mogrt_type] = extract_schema(fpath)
            props_count = len(schemas[mogrt_type]['properties'])
            print(f'  ✓ {mogrt_type}: {props_count} properties')
        except Exception as e:
            print(f'  ✗ {mogrt_type}: ERROR — {e}')
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(schemas, f, indent=2, ensure_ascii=False)
    
    print(f'\nWrote {out_path} ({len(schemas)} MOGRTs)')

if __name__ == '__main__':
    main()
