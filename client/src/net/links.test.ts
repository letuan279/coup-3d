import { describe, expect, it } from 'vitest';
import { hrefWithRoom, inviteLink, isLocalHostname, parseRoomLink, rejoinLink, sanitizeCode } from './links';

describe('room links', () => {
  it('parses ?room= and &key=, normalising the code', () => {
    expect(parseRoomLink('http://h:3000/?room=kx7qp')).toEqual({ code: 'KX7QP' });
    expect(parseRoomLink('http://h:3000/?room=KX7QP&key=s3cr3t')).toEqual({ code: 'KX7QP', key: 's3cr3t' });
    expect(parseRoomLink('http://h:3000/?room=KX7QP&key=')).toEqual({ code: 'KX7QP' });
    expect(parseRoomLink('http://h:3000/')).toBeNull();
    expect(parseRoomLink('http://h:3000/?room=AB')).toBeNull(); // too short to be a code
    expect(parseRoomLink('not a url')).toBeNull();
  });

  it('writing the room into the URL always drops the secret key', () => {
    expect(hrefWithRoom('http://h/?room=OLDYY&key=abc&mock=game', 'NEWXX')).toBe('http://h/?room=NEWXX&mock=game');
    expect(hrefWithRoom('http://h/?room=OLDYY&key=abc', null)).toBe('http://h/');
  });

  it('builds invite and rejoin links', () => {
    expect(inviteLink('http://192.168.1.5:3000', 'KX7QP')).toBe('http://192.168.1.5:3000/?room=KX7QP');
    expect(rejoinLink('https://coup.example', 'KX7QP', 'a+b/c')).toBe('https://coup.example/?room=KX7QP&key=a%2Bb%2Fc');
    expect(parseRoomLink(rejoinLink('https://coup.example', 'KX7QP', 'a+b/c'))).toEqual({ code: 'KX7QP', key: 'a+b/c' });
  });

  it('detects hosts only reachable from this machine', () => {
    for (const h of ['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) {
      expect(isLocalHostname(h), h).toBe(true);
    }
    for (const h of ['192.168.1.5', 'coup.example.com', '10.0.0.2', 'localhost.example.com']) {
      expect(isLocalHostname(h), h).toBe(false);
    }
  });

  it('sanitises typed codes', () => {
    expect(sanitizeCode(' kx-7q p0O1 ')).toBe('KX7QP');
  });
});
