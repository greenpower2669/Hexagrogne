import subprocess, tempfile, zipfile, unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/restore-assets.py'
class Restore(unittest.TestCase):
 def test_modified_archive_cannot_overwrite_source(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp); archive=root/'bad.zip'
   with zipfile.ZipFile(archive,'w') as z:z.writestr('app/game-engine.ts','corrupt')
   result=subprocess.run(['python3',str(SCRIPT),str(archive),'--target',str(root/'out')],capture_output=True)
   self.assertNotEqual(result.returncode,0)
   self.assertIn(b'Archive incompatible',result.stderr)
   self.assertFalse((root/'out/app/game-engine.ts').exists())
if __name__=='__main__':unittest.main()
