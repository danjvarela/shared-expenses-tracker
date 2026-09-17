import { describe, it, expect, vi, beforeEach } from 'vitest';

const appEnvMock = vi.hoisted(() => ({ APP_ENV: 'demo' as string }));
const authServiceMock = vi.hoisted(() => ({
	authenticateWithPassword: vi.fn(),
	generateSessionToken: vi.fn(),
	createSession: vi.fn()
}));

vi.mock('$lib/server/infra/app-env', () => ({
	get APP_ENV() {
		return appEnvMock.APP_ENV;
	}
}));
vi.mock('$lib/server/container', () => ({ authService: authServiceMock }));

import { POST } from './+server';

function makeEvent(body: Record<string, string>) {
	return {
		request: { formData: async () => new URLSearchParams(body) as unknown as FormData },
		url: new URL('https://demo.example/login/password'),
		cookies: { set: vi.fn() }
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /login/password', () => {
	beforeEach(() => {
		appEnvMock.APP_ENV = 'demo';
		authServiceMock.authenticateWithPassword.mockReset();
		authServiceMock.generateSessionToken.mockReset();
		authServiceMock.createSession.mockReset();
	});

	it('returns 404 outside the demo environment', async () => {
		appEnvMock.APP_ENV = 'production';
		await expect(POST(makeEvent({ email: 'a@example.com', password: 'x' }))).rejects.toMatchObject({
			status: 404
		});
	});

	it('rejects invalid credentials without creating a session', async () => {
		authServiceMock.authenticateWithPassword.mockResolvedValue(null);
		await expect(
			POST(makeEvent({ email: 'a@example.com', password: 'wrong' }))
		).rejects.toMatchObject({ status: 401 });
		expect(authServiceMock.createSession).not.toHaveBeenCalled();
	});

	it('creates a session and redirects on valid credentials', async () => {
		authServiceMock.authenticateWithPassword.mockResolvedValue({ userId: 'user-1' });
		authServiceMock.generateSessionToken.mockReturnValue('token');
		authServiceMock.createSession.mockResolvedValue({ expiresAt: new Date() });

		await expect(
			POST(makeEvent({ email: 'a@example.com', password: 'correct' }))
		).rejects.toMatchObject({ status: 302, location: '/' });
	});
});
