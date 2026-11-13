#!/usr/bin/env python3
"""Synthetic mocks only. No gcloud or network calls."""
import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
import urllib.error
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[2] / 'scripts/worldline-response-code-diagnostic.py'
SPEC = importlib.util.spec_from_file_location('worldline_diagnostic', PATH)
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)
ORDER = 'ORD-286357'
TOKEN = 'synthetic-oauth-private-token'
KEYS = {'merchantNumber': 'T123456', 'accessToken': 'synthetic-private-access',
        'secretToken': 'synthetic-private-secret', 'md5Key': 'synthetic-private-md5'}


def encode(value):
    if isinstance(value, dict):
        return {'mapValue': {'fields': {key: encode(item) for key, item in value.items()}}}
    if type(value) is int:
        return {'integerValue': str(value)}
    return {'stringValue': value}


class Fixture:
    def __init__(self, location_owner=True):
        self.calls = []
        owner = {'brandId': tool.BRAND}
        if location_owner:
            owner['locationId'] = tool.LOCATION
        digest = hashlib.sha256(json.dumps([tool.BRAND, owner.get('locationId')], separators=(',', ':')).encode()).hexdigest()
        self.reference = f'projects/{tool.PROJECT}/secrets/orderfly-worldline-{digest}-test/versions/7'
        self.order = {'brandId': tool.BRAND, 'locationId': tool.LOCATION,
                      'psp': {'provider': 'worldline', 'cancellationErrorCode': tool.ERROR_PREFIX},
                      'paymentAgreement': {'provider': 'worldline', 'mode': 'test', 'owner': owner,
                                           'reference': self.reference, 'merchantNumber': KEYS['merchantNumber'], 'revision': 1}}
        self.keys = copy.deepcopy(KEYS)
        self.catalog = {'meta': {'result': True}, 'responsecode': {'source': 'BEC', 'actioncode': '40200',
                        'enduserlabel': 'Error', 'merchantlabel': 'The session status does not permit this operation',
                        'parentactioncode': '40000', 'parentsource': 'BEC'}}

    def read(self, url, authorization, limit):
        self.calls.append((url, authorization, limit))
        if url.startswith('https://firestore.googleapis.com/v1/'):
            return {'name': f'projects/{tool.PROJECT}/databases/(default)/documents/orders/{ORDER}',
                    'fields': {key: encode(value) for key, value in self.order.items()}}
        if url == 'https://secretmanager.googleapis.com/v1/' + self.reference + ':access':
            return {'name': self.reference, 'payload': {'data': base64.b64encode(json.dumps(self.keys).encode()).decode()}}
        if url == tool.CATALOG_URL:
            return copy.deepcopy(self.catalog)
        raise AssertionError('Unexpected transport path')

    def run(self):
        return tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=self.read)


class DiagnosticTests(unittest.TestCase):
    def test_exact_read_only_flow_original_account_and_mask(self):
        for location_owner in [True, False]:
            with self.subTest(location_owner=location_owner):
                f = Fixture(location_owner)
                output = f.run()
                self.assertEqual(output['order'], ORDER)
                self.assertEqual(output['mode'], 'test')
                self.assertEqual(output['source'], 'BEC')
                self.assertEqual(output['actioncode'], '40200')
                self.assertEqual(len(f.calls), 3)
                self.assertIn('mask.fieldPaths=paymentAgreement', f.calls[0][0])
                self.assertIn('mask.fieldPaths=psp.cancellationErrorCode', f.calls[0][0])
                for url, auth, _ in f.calls[:2]:
                    self.assertIn('.googleapis.com/', url)
                    self.assertEqual(auth, 'Bearer ' + TOKEN)
                url, auth, _ = f.calls[2]
                self.assertEqual(url, tool.CATALOG_URL)
                self.assertEqual(auth, 'Basic ' + base64.b64encode((KEYS['accessToken'] + '@' + KEYS['merchantNumber'] + ':' + KEYS['secretToken']).encode()).decode())
                for private in [TOKEN, f.reference, *KEYS.values()]:
                    self.assertNotIn(private, json.dumps(output))

    def test_wrong_scope_provider_live_or_error_blocks_all_secret_reads(self):
        for change in ['brand', 'location', 'provider', 'live', 'owner', 'merchant', 'error']:
            with self.subTest(change=change):
                f = Fixture()
                if change in ['brand', 'location']:
                    f.order[change + 'Id'] = 'other-tenant'
                elif change == 'provider':
                    f.order['psp']['provider'] = 'stripe'
                elif change == 'live':
                    f.order['paymentAgreement']['mode'] = 'live'
                elif change == 'owner':
                    f.order['paymentAgreement']['owner']['locationId'] = 'other-location'
                elif change == 'merchant':
                    f.order['paymentAgreement']['merchantNumber'] = 'P123456'
                else:
                    f.order['psp']['cancellationErrorCode'] = 'arbitrary-private-message'
                with self.assertRaises(tool.DiagnosticError):
                    f.run()
                self.assertEqual(len(f.calls), 1)

    def test_pinned_reference_hash_project_environment_and_numeric_version(self):
        for replacement in ['wrong-hash', 'other-project', 'live', 'latest', 'zero', 'newline']:
            with self.subTest(replacement=replacement):
                f = Fixture()
                value = f.reference
                if replacement == 'wrong-hash': value = value.replace('orderfly-worldline-', 'orderfly-worldline-' + 'f' * 64)
                if replacement == 'other-project': value = value.replace(tool.PROJECT, 'other-project')
                if replacement == 'live': value = value.replace('-test/', '-live/')
                if replacement == 'latest': value = value.replace('/7', '/latest')
                if replacement == 'zero': value = value.replace('/7', '/0')
                if replacement == 'newline': value += '\n'
                f.order['paymentAgreement']['reference'] = value
                with self.assertRaises(tool.DiagnosticError): f.run()
                self.assertEqual(len(f.calls), 1)

    def test_secret_identity_and_credential_validation_before_provider(self):
        for key, value in [('merchantNumber', 'Tother'), ('accessToken', ''), ('secretToken', 'x' * 513), ('md5Key', 'secret\n')]:
            with self.subTest(key=key):
                f = Fixture(); f.keys[key] = value
                with self.assertRaises(tool.DiagnosticError): f.run()
                self.assertEqual(len(f.calls), 2)

    def test_malformed_or_foreign_google_documents_never_reach_provider(self):
        cases = [
            ('order', {'name': 'other-document', 'fields': {}}),
            ('order', {'name': f'projects/{tool.PROJECT}/databases/(default)/documents/orders/{ORDER}', 'fields': []}),
            ('key', {'name': 'other-secret', 'payload': {'data': 'private'}}),
            ('key', {'name': Fixture().reference, 'payload': {'data': 'not-base64!'}}),
            ('key', {'name': Fixture().reference, 'payload': {'data': base64.b64encode(b'not-json').decode()}}),
        ]
        for stage, response in cases:
            with self.subTest(stage=stage, malformed=type(response)):
                f = Fixture(); calls = []
                def read(url, auth, limit):
                    calls.append(url)
                    if (stage == 'order' and 'firestore.googleapis.com' in url) or (stage == 'key' and 'secretmanager.googleapis.com' in url):
                        return copy.deepcopy(response)
                    return f.read(url, auth, limit)
                with self.assertRaises(tool.DiagnosticError):
                    tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=read)
                self.assertEqual(len(calls), 1 if stage == 'order' else 2)

    def test_exact_data_project_number_is_accepted_only_as_response_alias(self):
        f = Fixture()
        def read(url, auth, limit):
            value = f.read(url, auth, limit)
            if 'secretmanager.googleapis.com' in url:
                self.assertIn('projects/' + tool.PROJECT + '/', url)
                value['name'] = f.reference.replace('projects/' + tool.PROJECT + '/', 'projects/' + tool.PROJECT_NUMBER + '/', 1)
            return value
        result = tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=read)
        self.assertEqual(result['actioncode'], '40200')
        self.assertEqual(len(f.calls), 3)

    def test_other_project_number_or_secret_version_alias_is_rejected(self):
        for altered in ['other-project', 'other-version', 'other-secret']:
            with self.subTest(altered=altered):
                f = Fixture()
                def read(url, auth, limit):
                    value = f.read(url, auth, limit)
                    if 'secretmanager.googleapis.com' in url:
                        canonical = f.reference.replace('projects/' + tool.PROJECT + '/', 'projects/' + tool.PROJECT_NUMBER + '/', 1)
                        if altered == 'other-project': canonical = canonical.replace(tool.PROJECT_NUMBER, '111222333444')
                        if altered == 'other-version': canonical = canonical.replace('/versions/7', '/versions/8')
                        if altered == 'other-secret': canonical = canonical.replace('/secrets/orderfly-', '/secrets/foreign-')
                        value['name'] = canonical
                    return value
                with self.assertRaisesRegex(tool.DiagnosticError, '^KEYS_INVALID$'):
                    tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=read)
                self.assertEqual(len(f.calls), 2)

    def test_catalog_refusal_malformed_or_other_identity_is_not_output(self):
        for change in ['false', 'source', 'code', 'number', 'missing', 'control', 'oversized']:
            with self.subTest(change=change):
                f = Fixture()
                if change == 'false': f.catalog['meta']['result'] = False
                if change == 'source': f.catalog['responsecode']['source'] = 'Other'
                if change == 'code': f.catalog['responsecode']['actioncode'] = '99999'
                if change == 'number': f.catalog['responsecode']['actioncode'] = 40200
                if change == 'missing': f.catalog = {}
                if change == 'control': f.catalog['responsecode']['merchantlabel'] = 'Secret\n'
                if change == 'oversized': f.catalog['responsecode']['merchantlabel'] = 'x' * 513
                with self.assertRaises(tool.DiagnosticError): f.run()
                self.assertEqual(len(f.calls), 3)

    def test_optional_null_catalog_labels_and_parents_are_normalized(self):
        f = Fixture()
        for name in ['enduserlabel', 'parentactioncode', 'parentsource']:
            f.catalog['responsecode'][name] = None
        output = f.run()
        for name in ['enduserlabel', 'parentactioncode', 'parentsource']:
            self.assertEqual(output[name], '')
        self.assertEqual(output['merchantlabel'], f.catalog['responsecode']['merchantlabel'])

    def test_read_errors_identify_only_fixed_stage_and_safe_http_status(self):
        for target, stage, status in [(0, 'ORDER', 403), (1, 'KEY', 403), (2, 'CATALOG', 401)]:
            for is_http in [True, False]:
                f = Fixture(); calls = []
                def read(url, auth, limit):
                    index = len(calls); calls.append(url)
                    if index == target:
                        if is_http: raise tool.DiagnosticError('READ_HTTP_' + str(status))
                        raise RuntimeError('synthetic-private-google-error')
                    return f.read(url, auth, limit)
                expected = stage + ('_READ_HTTP_' + str(status) if is_http else '_READ_UNAVAILABLE')
                with self.assertRaisesRegex(tool.DiagnosticError, '^' + expected + '$'):
                    tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=read)
                self.assertEqual(len(calls), target + 1)

    def test_all_credential_and_reference_reflections_abort_output(self):
        for private in [TOKEN, *KEYS.values(), Fixture().reference]:
            f = Fixture(); f.catalog['responsecode']['merchantlabel'] = 'Unexpected reflection: ' + private
            with self.assertRaisesRegex(tool.DiagnosticError, '^CATALOG_LABEL_REDACTED$'): f.run()

    def test_gcloud_token_is_captured_only_and_error_stderr_is_suppressed(self):
        completed = subprocess.CompletedProcess([], 0, stdout=TOKEN.encode() + b'\n')
        with patch.object(tool.subprocess, 'run', return_value=completed) as mocked:
            self.assertEqual(tool.oauth_token(), TOKEN)
            args, options = mocked.call_args
            self.assertEqual(args[0], ['gcloud', 'auth', 'print-access-token', '--quiet'])
            self.assertEqual(options['stdin'], subprocess.DEVNULL)
            self.assertEqual(options['stderr'], subprocess.DEVNULL)
            self.assertEqual(options['stdout'], subprocess.PIPE)
            self.assertEqual(options['timeout'], 15)
        for failure in [OSError('private-key'), subprocess.TimeoutExpired('private-command', 15)]:
            with patch.object(tool.subprocess, 'run', side_effect=failure):
                with self.assertRaisesRegex(tool.DiagnosticError, '^GOOGLE_AUTH_UNAVAILABLE$'): tool.oauth_token()

    def test_transport_get_only_fixed_timeout_size_and_no_redirects(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size):
                self.size = size
                return b'{"meta":{"result":true}}'
        response = Response()
        class Opener:
            def open(self, request, timeout):
                self.request, self.timeout = request, timeout
                return response
        opener = Opener()
        with patch.object(tool.urllib.request, 'build_opener', return_value=opener) as build:
            self.assertTrue(tool.get_json(tool.CATALOG_URL, 'Basic synthetic', 1024)['meta']['result'])
            self.assertIsInstance(build.call_args.args[0], tool.NoRedirect)
        self.assertEqual(opener.request.get_method(), 'GET')
        self.assertEqual(opener.request.full_url, tool.CATALOG_URL)
        self.assertIsNone(opener.request.data)
        self.assertEqual(opener.timeout, 8)
        self.assertEqual(response.size, 1025)
        self.assertIsNone(tool.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.test'))

    def test_transport_errors_and_oversized_json_are_fixed_and_not_retried(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'x' * size
        for value in [RuntimeError('private-google-response'), Response()]:
            opener = unittest.mock.Mock()
            if isinstance(value, Exception): opener.open.side_effect = value
            else: opener.open.return_value = value
            with patch.object(tool.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(tool.DiagnosticError, '^READ_UNAVAILABLE$'): tool.get_json(tool.CATALOG_URL, 'Basic synthetic', 4)
            self.assertEqual(opener.open.call_count, 1)

    def test_http_exception_status_is_bounded_and_provider_body_is_never_read(self):
        for status, expected in [(403, 'READ_HTTP_403'), ('private-key', 'READ_UNAVAILABLE')]:
            private_body = unittest.mock.Mock()
            failure = urllib.error.HTTPError(tool.CATALOG_URL, status, 'private-provider-message', {}, private_body)
            opener = unittest.mock.Mock(); opener.open.side_effect = failure
            with patch.object(tool.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(tool.DiagnosticError, '^' + expected + '$'):
                    tool.get_json(tool.CATALOG_URL, 'Basic synthetic', 4096)
            private_body.read.assert_not_called()
            self.assertEqual(opener.open.call_count, 1)

    def test_cli_errors_never_print_exception_or_arbitrary_arguments(self):
        for args in [['--unexpected-private-key'], ['--order', 'private-key']]:
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(tool.main(args), 1)
            self.assertNotIn('private-key', out.getvalue() + err.getvalue())
            self.assertNotIn('Traceback', out.getvalue() + err.getvalue())
        out, err = io.StringIO(), io.StringIO()
        with patch.object(tool, 'diagnose', side_effect=RuntimeError('private-key')), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(tool.main(['--order', ORDER]), 1)
        self.assertEqual(out.getvalue().strip(), '{"error":"DIAGNOSTIC_UNAVAILABLE"}')
        self.assertEqual(err.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
