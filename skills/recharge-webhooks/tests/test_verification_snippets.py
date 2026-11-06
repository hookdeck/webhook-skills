"""Run with python -m unittest discover -s skills/recharge-webhooks/tests.

Exercise the actual documented Python functions without a web framework.
"""
import ast
import hashlib
import hmac
from pathlib import Path
import re
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
NOW = 1000000
SECRET = 'synthetic-client-secret'
BODY = b'{"charge":{"id":123}}'


def load_verifier(path):
    text = path.read_text(encoding='utf-8')
    for code in re.findall(r'```python\n(.*?)\n```', text, re.S):
        tree = ast.parse(code)
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == 'verify_recharge_webhook_timestamped':
                namespace = dict(hashlib=hashlib, hmac=hmac,
                                 time=SimpleNamespace(time=lambda: NOW))
                module = ast.Module(body=[node], type_ignores=[])
                exec(compile(module, str(path), 'exec'), namespace)
                return namespace[node.name]
    raise AssertionError(f'No documented timestamped verifier in {path}')


def signed_header(timestamp=NOW):
    digest = hmac.new(SECRET.encode(), f'{timestamp}.'.encode()+BODY,
                      hashlib.sha256).hexdigest()
    return f't={timestamp},v1={digest}'


class DocumentedVerificationTests(unittest.TestCase):
    def setUp(self):
        self.verifiers = [(str(path.relative_to(ROOT)), load_verifier(path))
                          for path in (ROOT/'SKILL.md', ROOT/'references/verification.md')]

    def test_valid_header_variants(self):
        header = signed_header()
        variants = [header, header.replace(',v1=', ', v1='),
                    header.replace('t=', ' t = ').replace(',v1=', ' , v1 = ')+' ',
                    header+', v2=future-scheme']
        for name, verify in self.verifiers:
            for value in variants:
                with self.subTest(document=name, header=value):
                    self.assertTrue(verify(BODY, value, SECRET))

    def test_invalid_inputs_remain_rejected(self):
        invalid = ['', 'not-a-signature', f't={NOW}', 'v1=abc',
                   f't=invalid,v1=abc', f't={NOW},v1='+'0'*64,
                   signed_header(NOW-172801), signed_header(NOW+172801)]
        for name, verify in self.verifiers:
            for header in invalid:
                with self.subTest(document=name, header=header):
                    self.assertFalse(verify(BODY, header, SECRET))
            with self.subTest(document=name, tampered_body=True):
                self.assertFalse(verify(BODY+b' ', signed_header(), SECRET))
            with self.subTest(document=name, wrong_secret=True):
                self.assertFalse(verify(BODY, signed_header(), 'wrong-secret'))

    def test_replay_window_boundary(self):
        for name, verify in self.verifiers:
            for timestamp in (NOW-172800, NOW+172800):
                with self.subTest(document=name, timestamp=timestamp):
                    self.assertTrue(verify(BODY, signed_header(timestamp), SECRET))


if __name__ == '__main__':
    unittest.main()
