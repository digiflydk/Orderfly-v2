import 'server-only';
import * as admin from 'firebase-admin';
import { localQaEnvironment } from './local-qa-environment';

type ServiceAccount = {
	project_id: string;
	client_email: string;
	private_key: string;
};

const ADMIN_APP_NAME = 'orderfly-production-data';

let adminApp: admin.app.App | null = null;
let initError: Error | null = null;
let localQaDb: admin.firestore.Firestore | null = null;

function loadServiceAccount(): ServiceAccount | null {
	const raw =
		process.env.FB_SERVICE_ACCOUNT_JSON ??
		process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

	if (!raw) {
		initError = new Error(
			'FATAL: Firebase service account environment variable is not set.',
		);

		return null;
	}

	try {
		let jsonString = raw.trim();

		if (
			(jsonString.startsWith("'") && jsonString.endsWith("'")) ||
			(jsonString.startsWith('"') && jsonString.endsWith('"'))
		) {
			jsonString = jsonString.slice(1, -1);
		}

		const parsed = JSON.parse(jsonString) as ServiceAccount;

		if (
			!parsed.project_id ||
			!parsed.client_email ||
			!parsed.private_key
		) {
			throw new Error(
				'Service account JSON is missing project_id, client_email or private_key.',
			);
		}

		return parsed;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);

		initError = new Error(
			`Failed to parse Firebase service account JSON: ${message}`,
		);

		return null;
	}
}

function initializeAdminApp(): admin.app.App {
	const local = localQaEnvironment();
	if (local) return admin.initializeApp({ projectId: local.projectId,
		credential: { getAccessToken: async () => ({ access_token: 'owner', expires_in: 3600 }) },
	}, 'orderfly-local-qa0');
	if (initError) {
		throw initError;
	}

	const serviceAccount = loadServiceAccount();

	if (!serviceAccount) {
		throw new Error(
			'FATAL: Firebase service account is not configured.',
		);
	}

	return admin.initializeApp(
		{
			credential: admin.credential.cert({
				projectId: serviceAccount.project_id,
				clientEmail: serviceAccount.client_email,
				privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
			}),
			projectId: serviceAccount.project_id,
		},
		ADMIN_APP_NAME,
	);
}

export function getAdminApp(): admin.app.App {
	const local = localQaEnvironment();
	if (adminApp) {
		if (adminApp.name !== (local ? 'orderfly-local-qa0' : ADMIN_APP_NAME)
			|| local && adminApp.options.projectId !== local.projectId) throw new Error('Firebase runtime scope changed');
		return adminApp;
	}

	const existingApp = admin.apps.find(
		(app) => app?.name === (local ? 'orderfly-local-qa0' : ADMIN_APP_NAME),
	);

	if (local && existingApp && existingApp.options.projectId !== local.projectId) throw new Error('Firebase runtime scope changed');
	adminApp = existingApp ?? initializeAdminApp();

	return adminApp;
}

export function getAdminDb(): admin.firestore.Firestore {
	const local = localQaEnvironment();
	if (local) {
		// Explicit unusable credentials prevent ADC fallback; insecure emulator gRPC
		// never authenticates against Google. The launcher blocks all non-loopback I/O.
		return localQaDb ??= new admin.firestore.Firestore({ projectId: local.projectId,
			host: local.firestoreHost, ssl: false,
			credentials: { client_email: 'qa0@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
	}
	return getAdminApp().firestore();
}

export { admin };

export const getAdminFieldValue = () => {
	return admin.firestore.FieldValue;
};

export async function adminHealthProbe() {
	try {
		const app = getAdminApp();

		await app
			.firestore()
			.collection('__health_check__')
			.limit(1)
			.get();

		return {
			ok: true,
			projectId: app.options.projectId,
			appName: app.name,
			ts: Date.now(),
		};
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error ? error.message : String(error),
		};
	}
}
