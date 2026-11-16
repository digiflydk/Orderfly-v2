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
    if type(value) is bool:
        return {'booleanValue': value}
    if value is None:
        return {'nullValue': None}
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


class ExpiryFixture(Fixture):
    def __init__(self):
        super().__init__()
        self.session = 'synthetic-original-session-private'
        self.order.update(status='Pending', paymentStatus='Pending', paymentRevision=0,
                          paymentOperation='session-expiry:' + hashlib.sha256(self.session.encode()).hexdigest())
        self.order['psp'].update(checkoutSessionId=self.session, captured=False, voided=False,
                                 sessionExpired=False, transactionId=None)
        self.deletes = []
        self.rejection = {'meta': {'result': False, 'action': {'source': 'BEC', 'code': '40200', 'type': 'validationerror'},
                                  'message': {'merchant': 'The current session status does not allow expiry',
                                              'enduser': 'MUST NOT BE OUTPUT'}}}

    def delete(self, url, authorization, limit):
        self.deletes.append((url, authorization, limit))
        return 403, copy.deepcopy(self.rejection)

    def inspect(self, read=None, delete=None):
        return tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=read or self.read,
                             inspect_expiry_rejection=True, expiry_request=delete or self.delete)


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

    def test_default_mode_never_attempts_expiry_even_for_an_eligible_locked_order(self):
        f = ExpiryFixture()
        result = tool.diagnose(ORDER, token_getter=lambda: TOKEN, read_json=f.read, expiry_request=f.delete)
        self.assertEqual(result['actioncode'], '40200')
        self.assertEqual(f.deletes, [])
        self.assertEqual(len(f.calls), 3)
        self.assertNotIn('psp.checkoutSessionId', f.calls[0][0])

    def test_explicit_flag_requires_original_lock_and_pending_unpaid_no_transaction(self):
        for name, value in [('status', 'Canceled'), ('paymentStatus', 'Paid'), ('paymentOperation', None),
                            ('paymentOperation', 'other-lock'), ('paymentRevision', False),
                            ('psp.captured', True), ('psp.voided', True), ('psp.sessionExpired', True),
                            ('psp.captured', 0), ('psp.transactionId', '123'),
                            ('psp.checkoutSessionId', 'unsafe/session')]:
            with self.subTest(name=name, value=value):
                f = ExpiryFixture()
                if name.startswith('psp.'): f.order['psp'][name.split('.')[1]] = value
                else: f.order[name] = value
                with self.assertRaises(tool.DiagnosticError): f.inspect()
                self.assertEqual(len(f.calls), 1)
                self.assertEqual(f.deletes, [])

    def test_explicit_flag_scope_cannot_be_changed_to_another_test_tenant(self):
        f = ExpiryFixture()
        with self.assertRaisesRegex(tool.DiagnosticError, '^EXPIRY_ESMERALDA_SCOPE_REQUIRED$'):
            tool.diagnose(ORDER, expected_brand='other-brand', token_getter=lambda: TOKEN,
                          read_json=f.read, inspect_expiry_rejection=True, expiry_request=f.delete)
        self.assertEqual(f.calls, [])
        self.assertEqual(f.deletes, [])

    def test_original_order_rechecked_immediately_before_exactly_one_expiry_request(self):
        f = ExpiryFixture(); output = f.inspect()
        self.assertEqual(len(f.calls), 3)
        self.assertEqual(f.calls[0][0], f.calls[2][0])
        for watched in ['status', 'paymentStatus', 'paymentRevision', 'paymentOperation', 'psp.checkoutSessionId', 'psp.transactionId']:
            self.assertIn('mask.fieldPaths=' + watched, f.calls[0][0])
        self.assertEqual(len(f.deletes), 1)
        url, auth, limit = f.deletes[0]
        self.assertEqual(url, 'https://api.v1.checkout.bambora.com/sessions/' + f.session)
        self.assertTrue(auth.startswith('Basic ')); self.assertNotIn(TOKEN, auth)
        self.assertEqual(limit, 16384)
        self.assertEqual(output['operatorMerchantMessage'], f.rejection['meta']['message']['merchant'])
        self.assertEqual(output['operation'], 'original_session_expiry_attempt')
        self.assertFalse(output['result'])
        self.assertTrue(output['backendReconciliationRequired'])
        self.assertNotIn('sessionExpiryConfirmed', output)
        self.assertNotIn('MUST NOT BE OUTPUT', json.dumps(output))
        self.assertNotIn(f.session, json.dumps(output))

    def test_revision_callback_capture_and_binding_races_abort_before_delete(self):
        for change in ['revision', 'callback', 'capture', 'paid', 'lock', 'agreement', 'session', 'bool-type']:
            with self.subTest(change=change):
                f = ExpiryFixture(); count = []
                def read(url, auth, limit):
                    count.append(url)
                    if len(count) == 3:
                        if change == 'revision': f.order['paymentRevision'] = 1
                        if change == 'callback': f.order['psp']['transactionId'] = '123'
                        if change == 'capture': f.order['psp']['captured'] = True
                        if change == 'paid': f.order['paymentStatus'] = 'Paid'
                        if change == 'lock': f.order['paymentOperation'] = None
                        if change == 'agreement': f.order['paymentAgreement']['revision'] = 2
                        if change == 'session': f.order['psp']['checkoutSessionId'] = 'different'
                        if change == 'bool-type': f.order['psp']['captured'] = 0
                    return f.read(url, auth, limit)
                with self.assertRaisesRegex(tool.DiagnosticError, '^EXPIRY_ORDER_CHANGED$'): f.inspect(read=read)
                self.assertEqual(f.deletes, [])

    def test_original_rejection_message_redacts_credentials_oauth_session_and_base64(self):
        for value in [TOKEN, *KEYS.values(), Fixture().reference,
                      Fixture().reference.replace(tool.PROJECT, tool.PROJECT_NUMBER),
                      ExpiryFixture().session,
                      base64.b64encode(KEYS['md5Key'].encode()).decode(),
                      base64.b64encode((KEYS['accessToken'] + '@' + KEYS['merchantNumber'] + ':' + KEYS['secretToken']).encode()).decode()]:
            with self.subTest(kind=len(value)):
                f = ExpiryFixture(); f.rejection['meta']['message']['merchant'] = 'Provider reason reflects ' + value.upper()
                output = f.inspect()
                self.assertIn('[REDACTED]', output['operatorMerchantMessage'])
                self.assertNotIn(value.lower(), json.dumps(output).lower())
                self.assertEqual(len(f.deletes), 1)

    def test_original_rejection_requires_expected_identity_finite_type_and_safe_message(self):
        for changed, value in [('source', 'Other'), ('code', '40200\n'), ('code', '999'), ('type', 'private-type'),
                               ('type', 'success'), ('type', []), ('result', 'false'), ('message', 'x' * 513),
                               ('message', 'private\nmessage'), ('message', 'private\u202emessage')]:
            with self.subTest(changed=changed):
                f = ExpiryFixture()
                if changed == 'result': f.rejection['meta']['result'] = value
                elif changed == 'message': f.rejection['meta']['message']['merchant'] = value
                else: f.rejection['meta']['action'][changed] = value
                with self.assertRaises(tool.DiagnosticError): f.inspect()
                self.assertEqual(len(f.deletes), 1)

    def test_provider_reason_cannot_emit_a_url_or_session_capability(self):
        f = ExpiryFixture()
        f.rejection['meta']['message']['merchant'] = 'Inspect https://api.v1.checkout.bambora.com/sessions/' + f.session
        output = f.inspect()
        self.assertEqual(output['operatorMerchantMessage'], 'Inspect [REDACTED_URL]')
        self.assertNotIn('https://', json.dumps(output))

    def test_success_reports_only_session_expiry_and_requires_backend_reconciliation(self):
        f = ExpiryFixture()
        def success(url, auth, limit):
            f.deletes.append(url)
            return 200, {'meta': {'result': True, 'action': {'source': 'BEC', 'code': '2000', 'type': 'success'},
                                  'message': {'merchant': TOKEN}}}
        output = f.inspect(delete=success)
        self.assertTrue(output['sessionExpiryConfirmed'])
        self.assertTrue(output['backendReconciliationRequired'])
        self.assertNotIn('operatorMerchantMessage', output)
        self.assertNotIn(TOKEN, json.dumps(output))
        self.assertEqual(len(f.deletes), 1)
        self.assertEqual(f.order['status'], 'Pending')

    def test_current_checkout_success_code_20000_is_also_recognized(self):
        f = ExpiryFixture()
        def success(url, auth, limit):
            f.deletes.append(url)
            return 200, {'meta': {'result': True, 'action': {'source': 'BEC', 'code': '20000', 'type': 'success'}}}
        output = f.inspect(delete=success)
        self.assertTrue(output['sessionExpiryConfirmed'])
        self.assertTrue(output['backendReconciliationRequired'])
        self.assertEqual(output['actioncode'], '20000')
        self.assertEqual(len(f.deletes), 1)

    def test_unknown_or_contradictory_success_metadata_is_not_a_financial_claim(self):
        for code, source, action_type, status in [('999', 'BEC', 'success', 200),
                                                   ('20000', 'Other', 'success', 200),
                                                   ('2000', 'BEC', 'validationerror', 200),
                                                   ('20000', 'BEC', 'success', 403)]:
            f = ExpiryFixture()
            def success(url, auth, limit):
                f.deletes.append(url)
                return status, {'meta': {'result': True, 'action': {'source': source, 'code': code, 'type': action_type}}}
            with self.assertRaisesRegex(tool.DiagnosticError, '^EXPIRY_RESPONSE_IDENTITY_MISMATCH$'):
                f.inspect(delete=success)
            self.assertEqual(len(f.deletes), 1)

    def test_expiry_transport_reads_only_one_bounded_http_error_body_and_never_redirects(self):
        payload = json.dumps(ExpiryFixture().rejection).encode()
        body_stream = io.BytesIO(payload)
        failure = urllib.error.HTTPError('https://api.v1.checkout.bambora.com/sessions/original', 403, 'private-error', {}, body_stream)
        opener = unittest.mock.Mock(); opener.open.side_effect = failure
        with patch.object(tool.urllib.request, 'build_opener', return_value=opener) as build:
            status, body = tool.delete_expiry_json('https://api.v1.checkout.bambora.com/sessions/original', 'Basic original-test-key', 16384)
        self.assertEqual(status, 403)
        self.assertEqual(body['meta']['action']['code'], '40200')
        request = opener.open.call_args.args[0]
        self.assertEqual(request.get_method(), 'DELETE')
        self.assertIsNone(request.data)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 8)
        self.assertIsInstance(build.call_args.args[0], tool.NoRedirect)
        self.assertEqual(opener.open.call_count, 1)

    def test_expiry_bad_json_oversize_redirect_or_timeout_is_redacted_without_retry(self):
        for status, payload in [(403, b'not-json'), (403, b'x' * 16385), (302, b'private-redirect')]:
            opener = unittest.mock.Mock()
            opener.open.side_effect = urllib.error.HTTPError('https://api.v1.checkout.bambora.com/sessions/original', status, 'private-error', {}, io.BytesIO(payload))
            with patch.object(tool.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaises(tool.DiagnosticError): tool.delete_expiry_json('https://api.v1.checkout.bambora.com/sessions/original', 'Basic private', 16384)
            self.assertEqual(opener.open.call_count, 1)
        opener = unittest.mock.Mock(); opener.open.side_effect = TimeoutError('private-token')
        with patch.object(tool.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(tool.DiagnosticError, '^EXPIRY_RESPONSE_UNAVAILABLE$'):
                tool.delete_expiry_json('https://api.v1.checkout.bambora.com/sessions/original', 'Basic private', 16384)
        self.assertEqual(opener.open.call_count, 1)
        with self.assertRaisesRegex(tool.DiagnosticError, '^EXPIRY_ENDPOINT_INVALID$'):
            tool.delete_expiry_json('https://foreign.test/sessions/original', 'Basic private', 16384)


if __name__ == '__main__':
    unittest.main()
