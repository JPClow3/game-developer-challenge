import { test as base, expect } from '@playwright/test';
export type { Page } from '@playwright/test';

/** Automatic and installed before navigation, including pages opened by a test. */
type ExpectedFailure = {path:string;message:string;remaining:number};
export const test = base.extend<{ errorFreeConsole: void; expectNetworkFailure: (path:string, message:string, count?:number)=>void }>({
  // Playwright parses the destructured fixture signature; an empty object is required here.
  // eslint-disable-next-line no-empty-pattern
  expectNetworkFailure: async ({},use) => {
    const expected: ExpectedFailure[]=[];
    const register=(path:string,message:string,count=1)=>{expected.push({path,message,remaining:count});};
    Object.assign(register,{expected});await use(register);
  },
  errorFreeConsole: [async ({ context, expectNetworkFailure }, use, testInfo) => {
    const errors: string[] = [];
    const expectedMessages: string[]=[];
    const expected=(expectNetworkFailure as typeof expectNetworkFailure & {expected:ExpectedFailure[]}).expected;
    const listen = (page: import('@playwright/test').Page) => {
      page.on('pageerror', error=>errors.push(`pageerror: ${error.message}`));
      page.on('console', message=>{
        if(message.type()!=='error') return;
        const location=message.location();
        const allowed=expected.find(item=>item.remaining>0 && message.text()===item.message && new URL(location.url || 'about:blank').pathname===item.path && location.lineNumber===0);
        if(allowed){allowed.remaining--;expectedMessages.push(`${location.url}: ${message.text()}`);}
        else errors.push(`console.error: ${message.text()} (${location.url})`);
      });
    };
    context.pages().forEach(listen);context.on('page',listen);
    await use();
    // Completed checks no longer need continuous WebGL work while Playwright
    // captures its final screenshot/video and closes the browser context.
    for (const page of context.pages()) {
      if (!page.isClosed()) await page.evaluate(() => {
        (window as any).__PIXI_GAME__?.app?.ticker?.stop();
      });
    }
    if(expectedMessages.length) await testInfo.attach('declared-network-failures',{body:JSON.stringify(expectedMessages,null,2),contentType:'application/json'});
    if(errors.length) await testInfo.attach('browser-errors',{body:JSON.stringify(errors,null,2),contentType:'application/json'});
    expect(errors, 'Every page must have an error-free console').toEqual([]);
  }, { auto: true }],
});
export { expect };
