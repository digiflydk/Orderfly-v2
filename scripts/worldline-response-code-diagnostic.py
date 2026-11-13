#!/usr/bin/env python3
"""Read one official static response-code definition using a pinned TEST agreement.

No payment/session endpoint, mutation, key creation, raw response, or secret output.
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


def decode_fields(fields):
    if not isinstance(fields, dict):
        fail('ORDER_INVALID')
    result = {}
    for key, value in fields.items():
        if not isinstance(value, dict) or len(value) != 1:
            fail('ORDER_INVALID')
        if 'stringValue' in value:
            result[key] = value['stringValue']
        elif 'integerValue' in value:
            raw = value['integerValue']
            if not isinstance(raw, str) or not re.fullmatch(r'[1-9][0-9]{0,14}', raw):
                fail('ORDER_INVALID')
            result[key] = int(raw)
        elif 'mapValue' in value and isinstance(value['mapValue'], dict):
            result[key] = decode_fields(value['mapValue'].get('fields', {}))
        else:
            fail('ORDER_INVALID')
    return result


def diagnose(order_id, expected_brand=BRAND, expected_location=LOCATION,
             token_getter=oauth_token, read_json=get_json):
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
    token = token_getter()
    if not text(token, 8192):
        fail('GOOGLE_AUTH_UNAVAILABLE')
    document = f'projects/{PROJECT}/databases/(default)/documents/orders/{order_id}'
    mask = urllib.parse.urlencode([('mask.fieldPaths', path) for path in [
        'brandId', 'locationId', 'paymentAgreement', 'psp.provider', 'psp.cancellationErrorCode']])
    raw = read('ORDER', f'https://firestore.googleapis.com/v1/{document}?{mask}', 'Bearer ' + token, 32768)
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
        keys = json.loads(base64.b64decode(encoded, validate=True).decode('utf-8'))
    except DiagnosticError:
        raise
    except Exception:
        fail('KEYS_INVALID')
    if (not isinstance(keys, dict) or set(keys) != {'merchantNumber', 'accessToken', 'secretToken', 'md5Key'}
            or any(not text(keys.get(key)) for key in ['merchantNumber', 'accessToken', 'secretToken', 'md5Key'])
            or keys['merchantNumber'] != merchant):
        fail('KEYS_INVALID')
    basic = base64.b64encode((keys['accessToken'] + '@' + merchant + ':' + keys['secretToken']).encode('utf-8')).decode('ascii')
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
        args = parser.parse_args(argv)
        result = diagnose(args.order, args.expected_brand, args.expected_location)
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
