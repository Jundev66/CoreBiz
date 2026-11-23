import { describe, expect, it } from 'vitest';
import esMessages from '../../messages/es.json';
import enMessages from '../../messages/en.json';

describe('Legal Shield & Cookie Consent Content Parity', () => {
  it('contains all required legal disclaimer keys in Spanish message catalog', () => {
    const legal = esMessages.legal;
    expect(legal).toBeDefined();
    expect(legal.syntheticShieldTitle).toBeTruthy();
    expect(legal.syntheticShieldNotice).toBeTruthy();
    expect(legal.cookieConsentTitle).toBeTruthy();
    expect(legal.cookieConsentNotice).toBeTruthy();
    expect(legal.cookieAccept).toBeTruthy();
    expect(legal.cookiePreferences).toBeTruthy();
    expect(legal.termsTitle).toBeTruthy();
    expect(legal.termsBody).toBeTruthy();
    expect(legal.viewLegalNotice).toBeTruthy();

    expect(legal.syntheticShieldNotice).toContain('100% sintética y ficticia');
  });

  it('contains all required legal disclaimer keys in English message catalog', () => {
    const legal = enMessages.legal;
    expect(legal).toBeDefined();
    expect(legal.syntheticShieldTitle).toBeTruthy();
    expect(legal.syntheticShieldNotice).toBeTruthy();
    expect(legal.cookieConsentTitle).toBeTruthy();
    expect(legal.cookieConsentNotice).toBeTruthy();
    expect(legal.cookieAccept).toBeTruthy();
    expect(legal.cookiePreferences).toBeTruthy();
    expect(legal.termsTitle).toBeTruthy();
    expect(legal.termsBody).toBeTruthy();
    expect(legal.viewLegalNotice).toBeTruthy();

    expect(legal.syntheticShieldNotice).toContain('100% synthetic and fictitious');
  });

  it('ensures zero real-world attribution in legal copy', () => {
    const rawEs = JSON.stringify(esMessages.legal);
    const rawEn = JSON.stringify(enMessages.legal);

    expect(rawEs).not.toContain('SENIAT Real');
    expect(rawEn).not.toContain('IRS Real');
  });
});
