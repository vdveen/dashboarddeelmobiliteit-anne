import { dedupedFetch } from './dedupedFetch';
import { Headers, Response, Request } from 'whatwg-fetch';
beforeEach(() => { Object.assign(global, { Headers, Request }); });
afterEach(() => { delete global.fetch; });
test('normalizes header forms but never shares different credentials or caller signals', async () => {
  let finish;
  global.fetch = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const a = dedupedFetch('/same', { headers: new Headers({ Authorization: 'a' }) });
  const b = dedupedFetch('/same', { headers: [['authorization', 'a']] });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  finish(new Response('{}'));
  await Promise.all([a,b]);
  (global.fetch as jest.Mock).mockResolvedValue(new Response('{}'));
  await Promise.all([dedupedFetch('/same', { headers: { authorization: 'a' } }), dedupedFetch('/same', { headers: { authorization: 'b' } })]);
  expect(global.fetch).toHaveBeenCalledTimes(3);
  const signal = new AbortController().signal;
  await Promise.all([dedupedFetch('/same', { signal }), dedupedFetch('/same', { signal })]);
  expect(global.fetch).toHaveBeenCalledTimes(5);
});
