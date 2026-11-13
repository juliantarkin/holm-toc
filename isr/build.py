from pathlib import Path
import hashlib
import argparse

parser=argparse.ArgumentParser(description='Bundle the offline ISR explorer and mission demonstrator.')
here=Path(__file__).resolve().parent
default_source=here/'isr_explorer_src' if (here/'isr_explorer_src').is_dir() else here/'src'
parser.add_argument('--source',type=Path,default=default_source)
parser.add_argument('--out',type=Path,default=here.parent/'isr_pattern_explorer.html')
args=parser.parse_args()
src=args.source.resolve()
html=(src/'shell.html').read_text()
files={
    'STYLES':'style.css','FLEET_STYLES':'fleet-style.css','TRACKER_STYLES':'tracker-style.css',
    'MISSION_STYLES':'mission-style.css',
    'MODEL':'model.js','EXPORTS':'exports.js','APP':'app.js',
    'FLEET_ENGINE':'fleet-engine.js','FLEET_APP':'fleet-app.js',
    'TRACKER_APP':'tracker-app.js','NAVIGATION':'navigation.js',
    'MISSION_CATALOGUE':'mission-catalogue.js','MISSION_ENGINE':'mission-engine.js','MISSION_APP':'mission-app.js'
}
for key,name in files.items():
    content=(src/name).read_text()
    if name.endswith('.js'):
        assert '</script' not in content.lower(),name
    token='/*__'+key+'__*/'
    assert html.count(token)==1,token
    html=html.replace(token,content)
for key,name in [('SCHEDULE_PAGE','schedule.html'),('TRACKER_PAGE','tracker.html'),('MISSION_PAGE','mission.html')]:
    token='<!--__'+key+'__-->'
    assert html.count(token)==1,token
    html=html.replace(token,(src/name).read_text())
assert '/*__' not in html
out=args.out.resolve()
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html)
print(f'{out.name}: {out.stat().st_size:,} bytes; sha256 {hashlib.sha256(out.read_bytes()).hexdigest()}')
