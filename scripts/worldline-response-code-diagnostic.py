#!/usr/bin/env python3
"""Read one official static response-code definition using a pinned TEST agreement.

Default mode only reads the official static catalog. The explicit
--inspect-expiry-rejection option makes ONE expiry DELETE for the original
already-locked TEST session. It cannot capture/refund or update the native order.
No key creation, raw response, or secret output.
Run explicitly in an operator's authenticated Cloud Shell; standard library only.
"""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'orderfly-39325'
PROJECT_NUMBER = '770525071515'
BRAND = 'oeypKaMyYcQjIwaa1PtV'
LOCATION = 'eibiesSbluQTmp3mUqly'
ERROR_PREFIX = 'WORLDLINE_CANCEL_EXPIRY_HTTP_403_PROVIDER_40200_SRC_BEC'
CATALOG_URL = 'https://data-v1.api-eu.bambora.com/responsecodes/BEC/40200'


class DiagnosticError(Exception):
    """Only fixed, non-sensitive codes may leave the tool."""


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        fail('ARGUMENTS_INVALID')


def fail(code):
    raise DiagnosticError(code)


def text(value, maximum=512):
    return (isinstance(value, str) and 0 < len(value) <= maximum
            and not any(unicodedata.category(c) in {'Cc', 'Cf', 'Cs'} for c in value))


def identifier(value):
    return isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value) is not None


def oauth_token():
    try:
        result = subprocess.run(['gcloud', 'auth', 'print-access-token', '--quiet'], stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=15, check=False)
        token = result.stdout.decode('utf-8').strip()
        if result.returncode != 0 or not text(token, 8192):
            fail('GOOGLE_AUTH_UNAVAILABLE')
        return token
    except DiagnosticError:
        raise
    except Exception:
        fail('GOOGLE_AUTH_UNAVAILABLE')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_json(url, authorization, limit):
    # Caller supplies only constructed fixed-host URLs; auth is never placed in
    # a command, URL, exception, or output. Redirects cannot forward credentials.
    try:
        request = urllib.request.Request(url, headers={
            'Authorization': authorization, 'Accept': 'application/json'}, method='GET')
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(request, timeout=8) as response:
            if response.status != 200:
                status = response.status
                fail(f'READ_HTTP_{status}' if type(status) is int and 100 <= status <= 599 else 'READ_UNAVAILABLE')
            payload = response.read(limit + 1)
            if len(payload) > limit:
                fail('READ_UNAVAILABLE')
            return json.loads(payload.decode('utf-8'))
    except DiagnosticError:
        raise
    except urllib.error.HTTPError as error:
        status = error.code
        fail(f'READ_HTTP_{status}' if type(status) is int and 100 <= status <= 599 else 'READ_UNAVAILABLE')
    except Exception:
        fail('READ_UNAVAILABLE')


def delete_expiry_json(url, authorization, limit):
    """Exactly one original-session expiry request; never retry an unknown reply."""
    if re.fullmatch(r'https://api\.v1\.checkout\.bambora\.com/sessions/[A-Za-z0-9_-]{1,256}', url) is None:
        fail('EXPIRY_ENDPOINT_INVALID')
    try:
        request = urllib.request.Request(url, headers={
            'Authorization': authorization, 'Accept': 'application/json'}, method='DELETE')
        opener = urllib.request.build_opener(NoRedirect())
        try:
            response = opener.open(request, timeout=8)
        except urllib.error.HTTPError as error:
            # Only this explicit diagnostic request may inspect its bounded
            # rejection body. Google/catalog errors are never read or printed.
            response = error
        with response:
            status = response.status
            if type(status) is not int or not 100 <= status <= 599:
                fail('EXPIRY_RESPONSE_INVALID')
            payload = response.read(limit + 1)
            if len(payload) > limit:
                fail('EXPIRY_RESPONSE_INVALID')
            return status, json.loads(payload.decode('utf-8'))
    except DiagnosticError:
        raise
    except Exception:
        fail('EXPIRY_RESPONSE_UNAVAILABLE')


def decode_fields(fields):
    if not isinstance(fields, dict):
        fail('ORDER_INVALID')
    result = {}
    for key, value in fields.items():
        if not isinstance(value, dict) or len(value) != 1:
            fail('ORDER_INVALID')
        if 'stringValue' in value:
            if not isinstance(value['stringValue'], str):
                fail('ORDER_INVALID')
            result[key] = value['stringValue']
        elif 'integerValue' in value:
            raw = value['integerValue']
            if not isinstance(raw, str) or not re.fullmatch(r'(?:0|[1-9][0-9]{0,14})', raw):
                fail('ORDER_INVALID')
            result[key] = int(raw)
        elif 'mapValue' in value and isinstance(value['mapValue'], dict):
            result[key] = decode_fields(value['mapValue'].get('fields', {}))
        elif 'booleanValue' in value and type(value['booleanValue']) is bool:
            result[key] = value['booleanValue']
        elif 'nullValue' in value and value['nullValue'] is None:
            result[key] = None
        else:
            fail('ORDER_INVALID')
    return result


def validate_expiry_lock(order):
    psp = order.get('psp', {})
    session = psp.get('checkoutSessionId')
    if (order.get('status') != 'Pending' or order.get('paymentStatus') != 'Pending'
            or not isinstance(session, str) or re.fullmatch(r'[A-Za-z0-9_-]{1,256}', session) is None):
        fail('EXPIRY_ORDER_INELIGIBLE')
    for field in ['captured', 'voided', 'sessionExpired']:
        value = psp.get(field)
        if value is not None and (type(value) is not bool or value):
            fail('EXPIRY_ORDER_INELIGIBLE')
    if psp.get('transactionId') is not None:
        fail('EXPIRY_KNOWN_TRANSACTION_REQUIRES_RECONCILIATION')
    revision = order.get('paymentRevision', 0)
    if type(revision) is not int or revision < 0:
        fail('EXPIRY_ORDER_INELIGIBLE')
    expected = 'session-expiry:' + hashlib.sha256(session.encode('utf-8')).hexdigest()
    if order.get('paymentOperation') != expected:
        fail('EXPIRY_ORIGINAL_LOCK_REQUIRED')
    return session


def expiry_diagnostic(status, body, private_values):
    if not isinstance(body, dict) or not isinstance(body.get('meta'), dict):
        fail('EXPIRY_RESPONSE_INVALID')
    meta = body['meta']
    action = meta.get('action')
    if not isinstance(action, dict) or action.get('source') != 'BEC':
        fail('EXPIRY_RESPONSE_IDENTITY_MISMATCH')
    if (type(meta.get('result')) is not bool or not isinstance(action.get('type'), str) or action.get('type') not in
            {'success', 'validationerror', 'generalerror', 'systemerror', 'acquirererror'}):
        fail('EXPIRY_RESPONSE_INVALID')
    if meta['result'] is True:
        if (not 200 <= status < 300 or not isinstance(action.get('code'), str)
                or action['code'] not in {'2000', '20000'} or action['type'] != 'success'):
            fail('EXPIRY_RESPONSE_IDENTITY_MISMATCH')
        return {'httpStatus': status, 'source': 'BEC', 'actioncode': action['code'], 'type': 'success',
                'result': True, 'sessionExpiryConfirmed': True, 'backendReconciliationRequired': True}
    if status != 403 or action.get('code') != '40200' or action['type'] == 'success':
        fail('EXPIRY_RESPONSE_IDENTITY_MISMATCH')
    message = meta.get('message')
    reason = message.get('merchant') if isinstance(message, dict) else None
    if not text(reason):
        fail('EXPIRY_MESSAGE_INVALID')
    expanded = set(value for value in private_values if isinstance(value, str) and value)
    expanded.update(base64.b64encode(value.encode('utf-8')).decode('ascii') for value in list(expanded))
    for private in sorted(expanded, key=len, reverse=True):
        reason = re.sub(re.escape(private), '[REDACTED]', reason, flags=re.IGNORECASE)
    reason = re.sub(r'https?://[^\s<>"\']+', '[REDACTED_URL]', reason, flags=re.IGNORECASE)
    if len(reason) > 512:
        fail('EXPIRY_MESSAGE_INVALID')
    return {'httpStatus': 403, 'source': 'BEC', 'actioncode': '40200', 'type': action['type'],
            'result': False, 'operatorMerchantMessage': reason, 'backendReconciliationRequired': True}


def diagnose(order_id, expected_brand=BRAND, expected_location=LOCATION,
             token_getter=oauth_token, read_json=get_json, inspect_expiry_rejection=False,
             expiry_request=delete_expiry_json):
    def read(stage, url, authorization, limit):
        try:
            return read_json(url, authorization, limit)
        except DiagnosticError as error:
            code = str(error)
            if re.fullmatch(r'READ_HTTP_[1-5][0-9]{2}', code):
                fail(stage + '_' + code)
            fail(stage + '_READ_UNAVAILABLE')
        except Exception:
            fail(stage + '_READ_UNAVAILABLE')

    if not isinstance(order_id, str) or re.fullmatch(r'ORD-[0-9]{6}', order_id) is None:
        fail('ORDER_ID_INVALID')
    if not identifier(expected_brand) or not identifier(expected_location):
        fail('SCOPE_INVALID')
    if inspect_expiry_rejection and (expected_brand != BRAND or expected_location != LOCATION):
        fail('EXPIRY_ESMERALDA_SCOPE_REQUIRED')
    token = token_getter()
    if not text(token, 8192):
        fail('GOOGLE_AUTH_UNAVAILABLE')
    document = f'projects/{PROJECT}/databases/(default)/documents/orders/{order_id}'
    fields = ['brandId', 'locationId', 'paymentAgreement', 'psp.provider', 'psp.cancellationErrorCode']
    if inspect_expiry_rejection:
        fields += ['status', 'paymentStatus', 'paymentRevision', 'paymentOperation', 'psp.checkoutSessionId',
                   'psp.captured', 'psp.voided', 'psp.sessionExpired', 'psp.transactionId']
    mask = urllib.parse.urlencode([('mask.fieldPaths', path) for path in fields])
    order_url = f'https://firestore.googleapis.com/v1/{document}?{mask}'
    raw = read('ORDER', order_url, 'Bearer ' + token, 32768)
    if not isinstance(raw, dict) or raw.get('name') != document:
        fail('ORDER_INVALID')
    order = decode_fields(raw.get('fields'))
    if order.get('brandId') != expected_brand or order.get('locationId') != expected_location:
        fail('SCOPE_MISMATCH')
    psp = order.get('psp')
    if not isinstance(psp, dict) or psp.get('provider') != 'worldline':
        fail('PROVIDER_MISMATCH')
    error = psp.get('cancellationErrorCode')
    if not isinstance(error, str) or not (error == ERROR_PREFIX or error.startswith(ERROR_PREFIX + '_REASON_')):
        fail('DIAGNOSTIC_CASE_MISMATCH')
    session = validate_expiry_lock(order) if inspect_expiry_rejection else None
    binding = order.get('paymentAgreement')
    if not isinstance(binding, dict) or set(binding) != {'provider', 'mode', 'owner', 'reference', 'merchantNumber', 'revision'}:
        fail('AGREEMENT_INVALID')
    if binding['provider'] != 'worldline' or binding['mode'] != 'test':
        fail('TEST_AGREEMENT_REQUIRED')
    owner = binding['owner']
    if (not isinstance(owner, dict) or set(owner) not in [{'brandId'}, {'brandId', 'locationId'}]
            or owner.get('brandId') != expected_brand
            or ('locationId' in owner and owner['locationId'] != expected_location)):
        fail('AGREEMENT_SCOPE_MISMATCH')
    merchant = binding['merchantNumber']
    if not isinstance(merchant, str) or re.fullmatch(r'T[A-Za-z0-9]{1,127}', merchant) is None:
        fail('TEST_MERCHANT_REQUIRED')
    if type(binding['revision']) is not int or binding['revision'] <= 0:
        fail('AGREEMENT_INVALID')
    scope = json.dumps([owner['brandId'], owner.get('locationId')], separators=(',', ':'), ensure_ascii=False)
    digest = hashlib.sha256(scope.encode('utf-8')).hexdigest()
    prefix = f'projects/{PROJECT}/secrets/orderfly-worldline-{digest}-test/versions/'
    reference = binding['reference']
    if (not isinstance(reference, str) or not reference.startswith(prefix)
            or re.fullmatch(r'[1-9][0-9]{0,14}', reference[len(prefix):]) is None):
        fail('PINNED_REFERENCE_MISMATCH')
    secret_response = read('KEY', 'https://secretmanager.googleapis.com/v1/' + reference + ':access', 'Bearer ' + token, 16384)
    try:
        # Google may canonicalize the project component in its response only.
        # The request and pinned secret/version are unchanged, and the numeric
        # alias is restricted to this exact data project, never any project.
        canonical_reference = reference.replace('projects/' + PROJECT + '/', 'projects/' + PROJECT_NUMBER + '/', 1)
        if not isinstance(secret_response, dict) or secret_response.get('name') not in {reference, canonical_reference}:
            fail('KEYS_INVALID')
        encoded = secret_response['payload']['data']
        if not isinstance(encoded, str) or len(encoded) > 12000:
            fail('KEYS_INVALID')
        secret_json = base64.b64decode(encoded, validate=True).decode('utf-8')
        keys = json.loads(secret_json)
    except DiagnosticError:
        raise
    except Exception:
        fail('KEYS_INVALID')
    if (not isinstance(keys, dict) or set(keys) != {'merchantNumber', 'accessToken', 'secretToken', 'md5Key'}
            or any(not text(keys.get(key)) for key in ['merchantNumber', 'accessToken', 'secretToken', 'md5Key'])
            or keys['merchantNumber'] != merchant):
        fail('KEYS_INVALID')
    basic = base64.b64encode((keys['accessToken'] + '@' + merchant + ':' + keys['secretToken']).encode('utf-8')).decode('ascii')
    if inspect_expiry_rejection:
        fresh = read('ORDER_RECHECK', order_url, 'Bearer ' + token, 32768)
        if not isinstance(fresh, dict) or fresh.get('name') != document:
            fail('EXPIRY_ORDER_CHANGED')
        fresh_order = decode_fields(fresh.get('fields'))
        if json.dumps(fresh_order, sort_keys=True) != json.dumps(order, sort_keys=True):
            fail('EXPIRY_ORDER_CHANGED')
        validate_expiry_lock(fresh_order)
        try:
            status, response = expiry_request('https://api.v1.checkout.bambora.com/sessions/' + session,
                                             'Basic ' + basic, 16384)
        except DiagnosticError:
            raise
        except Exception:
            fail('EXPIRY_RESPONSE_UNAVAILABLE')
        private_values = [token, basic, 'Basic ' + basic, encoded, secret_json, reference, canonical_reference, session, *keys.values(),
                          keys['accessToken'] + '@' + merchant + ':' + keys['secretToken']]
        result = expiry_diagnostic(status, response, private_values)
        return {'order': order_id, 'mode': 'test', 'operation': 'original_session_expiry_attempt', **result}
    catalog = read('CATALOG', CATALOG_URL, 'Basic ' + basic, 16384)
    if (not isinstance(catalog, dict) or not isinstance(catalog.get('meta'), dict)
            or catalog['meta'].get('result') is not True or not isinstance(catalog.get('responsecode'), dict)):
        fail('CATALOG_UNAVAILABLE')
    entry = catalog['responsecode']
    if entry.get('source') != 'BEC' or entry.get('actioncode') != '40200':
        fail('CATALOG_IDENTITY_MISMATCH')
    labels = {}
    for name in ['enduserlabel', 'merchantlabel', 'parentactioncode', 'parentsource']:
        value = entry.get(name, '')
        if value is None:
            value = ''
        if not isinstance(value, str) or len(value) > 512 or (value and not text(value)):
            fail('CATALOG_LABEL_INVALID')
        labels[name] = value
    # Even unexpected reflected values from the provider cannot leave this tool.
    private_values = [token, basic, reference, *keys.values()]
    if any(private.lower() in value.lower() for private in private_values for value in labels.values()):
        fail('CATALOG_LABEL_REDACTED')
    return {'order': order_id, 'mode': 'test', 'source': 'BEC', 'actioncode': '40200', **labels}


def main(argv=None):
    try:
        parser = SafeArgumentParser(description=__doc__)
        parser.add_argument('--order', required=True)
        parser.add_argument('--expected-brand', default=BRAND)
        parser.add_argument('--expected-location', default=LOCATION)
        parser.add_argument('--inspect-expiry-rejection', action='store_true',
                            help='Make ONE original locked TEST-session expiry DELETE; not read-only. Never retry automatically.')
        args = parser.parse_args(argv)
        result = diagnose(args.order, args.expected_brand, args.expected_location,
                          inspect_expiry_rejection=args.inspect_expiry_rejection)
        print(json.dumps(result, ensure_ascii=True, sort_keys=True))
        return 0
    except DiagnosticError as error:
        print(json.dumps({'error': str(error)}))
        return 1
    except Exception:
        print('{"error":"DIAGNOSTIC_UNAVAILABLE"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
