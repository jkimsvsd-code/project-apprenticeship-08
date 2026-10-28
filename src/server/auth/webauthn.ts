import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport,
} from '@simplewebauthn/server';
import type { Config } from '../config/env.js';
import type { Session, Enrollment, Credential } from '../storage/store.js';
import type { DataStore } from '../storage/contracts.js';
import type { Provider, RegistrationMethod } from '../../shared/contracts.js';
import { invalidCeremony, unauthorized } from './errors.js';

export class WebAuthnService {
  constructor(private store: DataStore, private config: Config) {}

  async registrationOptions(flowHash: string, session: Session | null, enrollment: Enrollment | null, method: RegistrationMethod = 'auto') {
    if (!session && !enrollment) throw unauthorized();
    const user = session?.user ?? { id: enrollment!.userId, displayName: enrollment!.displayName, handle: enrollment!.handle };
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName, rpID: this.config.rpId,
      userID: new Uint8Array(Buffer.from(user.handle, 'base64url')), userName: user.displayName, userDisplayName: user.displayName,
      attestationType: 'none', timeout: 60_000,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      preferredAuthenticatorType: ({ device: 'localDevice', phone: 'remoteDevice', 'security-key': 'securityKey', auto: undefined } as const)[method],
      supportedAlgorithmIDs: [-7, -257],
      excludeCredentials: (await this.store.credentials(user.id)).map(credential => ({ id: credential.id, transports: credential.transports })),
    });
    const challenge = await this.store.createChallenge({
      value: options.challenge, purpose: 'registration', flowHash,
      actorHash: session?.hash ?? enrollment!.hash, userId: user.id, expiresAt: Date.now() + this.config.challengeTtl,
    });
    return { challengeId: challenge.id, options };
  }

  async register(input: { challengeId: string; response: RegistrationResponseJSON; name: string; provider: Provider },
    flowHash: string, session: Session | null, enrollment: Enrollment | null) {
    const challenge = await this.store.consumeChallenge(input.challengeId, flowHash, 'registration');
    const actorHash = session?.hash ?? enrollment?.hash;
    const userId = session?.user.id ?? enrollment?.userId;
    if (!actorHash || actorHash !== challenge.actorHash || !userId || userId !== challenge.userId) throw invalidCeremony();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response, expectedChallenge: challenge.value, expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpId, requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch { throw invalidCeremony(); }
    if (!verification.verified || !verification.registrationInfo) throw invalidCeremony();
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const stored: Credential = {
      id: credential.id, userId, publicKey: new Uint8Array(credential.publicKey), counter: credential.counter,
      transports: (credential.transports ?? []) as AuthenticatorTransport[], name: input.name, provider: input.provider,
      createdAt: Date.now(), deviceType: credentialDeviceType, backedUp: credentialBackedUp,
    };
    return this.store.registerCredential(stored, { sessionHash: session?.hash, enrollmentHash: enrollment?.hash }, this.config.sessionTtl);
  }

  async authenticationOptions(flowHash: string) {
    const options = await generateAuthenticationOptions({ rpID: this.config.rpId, userVerification: 'required', timeout: 60_000 });
    const challenge = await this.store.createChallenge({
      value: options.challenge, purpose: 'authentication', flowHash, actorHash: null, userId: null,
      expiresAt: Date.now() + this.config.challengeTtl,
    });
    return { challengeId: challenge.id, options };
  }

  async authenticate(input: { challengeId: string; response: AuthenticationResponseJSON }, flowHash: string) {
    const challenge = await this.store.consumeChallenge(input.challengeId, flowHash, 'authentication');
    const credential = await this.store.getCredential(input.response.id);
    if (!credential) throw invalidCeremony();
    const account = await this.store.getAccount(credential.userId);
    if (!account || input.response.response.userHandle !== account.handle) throw invalidCeremony();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response, expectedChallenge: challenge.value, expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpId, requireUserVerification: true,
        credential: { id: credential.id, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports },
      });
    } catch { throw invalidCeremony(); }
    if (!verification.verified) throw invalidCeremony();
    return this.store.completeLogin(credential.id, credential.counter, verification.authenticationInfo.newCounter, this.config.sessionTtl);
  }
}
