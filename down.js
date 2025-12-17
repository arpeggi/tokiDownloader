import { connect } from "puppeteer-real-browser";
import fs from 'node:fs';

let info = {
    url: '',
    protocolDomain: 'https://booktoki350.com',
    siteTitle: '북토끼',
    site: 'booktoki',
    startIndex: 0,
    lastIndex: 99999,
    contentTitle: '화산귀환'
}

function sleep(ms) {
    return new Promise(function (resolve) {
        setTimeout(() => { resolve(); }, ms);
    })
}
function consoleRed(val) {
    console.log(`\x1b[41m${val}\x1b[0m`);
}
function consoleGrey(val) {
    console.log(`\x1b[100m${val}\x1b[0m`);
}
function help() {
    console.log(`사용법: node down -url "URL" [-start STARTINDEX] [-last LASTINDEX]`);
    process.exit();
}

function analyseArguments() {
    let argL = process.argv.length;
    if (argL == 2) {
        help();
    }
    for (let i = 2; i < argL; i++) {
        if (process.argv[i] == '-url') {
            if ((i + 1) < argL) {
                info.url = process.argv[i + 1];
                i++;
            }
        }
        else if (process.argv[i] == '-start') {
            if ((i + 1) < argL) {
                info.startIndex = parseInt(process.argv[i + 1]);
                i++;
            }
        }
        else if (process.argv[i] == '-last') {
            if ((i + 1) < argL) {
                info.lastIndex = parseInt(process.argv[i + 1]);
                i++;
            }
        }
        else if (process.argv[i] == '-h' || process.argv[i] == '-help') {
            help();
        }
    }
    if (!info.url) {
        consoleGrey('url을 입력하세요');
        process.exit();
    }
    // check url
    // 북토끼
    if (info.url.match(/^https:\/\/booktoki[0-9]+.com\/novel\/[0-9]+/)) {
        info.site = 'booktoki'; info.siteTitle = '북토끼';
        info.protocolDomain = info.url.match(/^https:\/\/booktoki[0-9]+.com/)[0];
    }
    // 뉴토끼
    else if (info.url.match(/^https:\/\/newtoki[0-9]+.com\/webtoon\/[0-9]+/)) {
        info.site = 'newtoki'; info.siteTitle = '뉴토끼';
        info.protocolDomain = info.url.match(/^https:\/\/newtoki[0-9]+.com/)[0];
    }
    // 마나토끼
    else if (info.url.match(/^https:\/\/manatoki[0-9]+.net\/comic\/[0-9]+/)) {
        info.site = 'manatoki'; info.siteTitle = '마나토끼';
        info.protocolDomain = info.url.match(/^https:\/\/manatoki[0-9]+.net/)[0];
    }
    else {
        consoleGrey('회차 목록 페이지 url을 입력해야합니다. url을 확인해주세요.');
        process.exit();
    }
}
function saveBook(path, fileName, content) {
    if (!fs.existsSync(path))
        fs.mkdirSync(path, { recursive: true });
    fs.writeFileSync(`${path}/${fileName}`, content);
}
async function saveImage(page, path, fileName, src) {
    // 이미지버퍼 저장
    const imageBuffer = await page.evaluate(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return Array.from(new Uint8Array(buffer)); // serialize-able 형태로 변환
    }, src);
    // 경로가 없다면 만들기
    if (!fs.existsSync(path))
        fs.mkdirSync(path, { recursive: true });
    // Buffer로 변환해서 파일 저장
    fs.writeFileSync(`${path}/${fileName}`, Buffer.from(imageBuffer));
}

async function waitForCaptchaSolved(page, site) {
    // 페이지 로드 후 일정 시간 대기 (캡차가 나타날 시간을 줌)
    await sleep(3000);
    
    // 예상되는 콘텐츠가 나타나는지 확인
    const hasContent = await page.evaluate((siteType) => {
        if (siteType === 'booktoki') {
            // 북토끼: #novel_content가 있는지 확인
            return !!document.querySelector('#novel_content');
        } else {
            // 뉴토끼, 마나토끼: .view-padding div img가 있는지 확인
            const images = document.querySelectorAll('.view-padding div img');
            return images.length > 0;
        }
    }, site);
    
    // 콘텐츠가 없으면 캡차일 가능성이 높음
    if (!hasContent) {
        consoleRed(`⚠️  캡차가 감지되었습니다. 브라우저에서 캡차를 해결해주세요...`);
        consoleGrey('캡차를 해결하면 자동으로 계속 진행됩니다.');
        
        // 콘텐츠가 나타날 때까지 대기
        let contentLoaded = false;
        let attempts = 0;
        const maxAttempts = 600; // 최대 10분 대기 (1초 * 600)
        
        while (!contentLoaded && attempts < maxAttempts) {
            await sleep(1000);
            attempts++;
            
            // 콘텐츠가 로드되었는지 확인
            contentLoaded = await page.evaluate((siteType) => {
                if (siteType === 'booktoki') {
                    const content = document.querySelector('#novel_content');
                    return content && content.innerText.length > 50; // 텍스트가 충분히 있는지
                } else {
                    const images = document.querySelectorAll('.view-padding div img');
                    // 이미지가 있고, 최소 하나는 보이는지 확인
                    if (images.length > 0) {
                        for (let img of images) {
                            if (img.checkVisibility && img.checkVisibility()) {
                                return true;
                            }
                        }
                    }
                    return false;
                }
            }, site);
            
            if (attempts % 10 === 0) {
                consoleGrey(`대기 중... (${attempts}초 경과)`);
            }
        }
        
        if (contentLoaded) {
            console.log('✅ 캡차가 해결되었습니다. 계속 진행합니다.');
            await sleep(2000); // 페이지가 완전히 로드될 때까지 추가 대기
            return true; // 콘텐츠를 찾았음을 반환
        } else {
            consoleRed('⏱️  캡차 대기 시간이 초과되었습니다. 계속 진행합니다.');
            return false; // 콘텐츠를 찾지 못했음을 반환
        }
    }
    
    // 이미 콘텐츠가 있으면 true 반환
    return true;
}

async function main() {
    const { browser, page } = await connect({
        headless: false,
        args: [],
        customConfig: {},
        turnstile: true, //captcha를 자동으로 풀것인지
        connectOption: { defaultViewport: null },
        disableXvfb: false, //화면을 볼것인지
    })
    try {
        // await page.goto('https://booktoki350.com/');
        await Promise.all([page.waitForNavigation(), page.goto(info.url)]);
        // cloudflare에 막히기때문에 title이 바뀌기전까지 기다린다.
        while (!(await page.title()).includes(info.siteTitle)) {
            await sleep(100);
        }
        let link = [];
        // 연재 목록들의 링크를 알아낸다. {num:회차, fileName:연재제목, src:링크}로 구성되어있다.
        while (true) {
            await page.locator('.list-body').setTimeout(40000).wait();
            sleep(1000);
            link = link.concat(await page.evaluate(() => {
                let list = Array.from(document.querySelector('.list-body').querySelectorAll('li'));
                for (let i = 0; i < list.length; i++) {
                    list[i] = {
                        num: list[i].querySelector('.wr-num').innerText.padStart(4, '0'),
                        fileName: list[i].querySelector('a').innerHTML.replace(/<span[\s\S]*?\/span>/g, '').trim(),
                        src: list[i].querySelector('a').href
                    }
                }
                return list;
            }));
            info.contentTitle = await page.evaluate(() => document.querySelector('.page-title .page-desc').innerText);
            // 다음 페이지가 없다면 break
            if (await page.$('ul.pagination li[class="active"] ~ li:not([class="disabled"]) a')) {
                await Promise.all([
                    page.waitForNavigation(),
                    page.locator('ul.pagination li[class="active"] ~ li:not([class="disabled"]) a').click()
                ]);
            }
            else
                break;
        }
        // 1화부터 받을것이기 때문에 리버스 해준다.
        link.reverse();
        // info.startIndex와 info.lastIndex필터하기.
        while (parseInt(link[0].num) < info.startIndex) {
            link.shift();
        }
        while (info.lastIndex < parseInt(link.at(-1).num)) {
            link.pop();
        }
        // 페이지 방문하기
        for (let i = 0; i < link.length; i++) {
            await Promise.all([page.goto(link[i].src), page.waitForNavigation()]);
            await sleep(2000);
            console.log(`${link[i].num} ${link[i].fileName} 진행중`);
            
            // 캡차가 있는지 확인하고 해결될 때까지 대기
            const contentFound = await waitForCaptchaSolved(page, info.site);
            
            // 콘텐츠를 찾지 못했으면 이 회차를 건너뜀
            if (!contentFound) {
                consoleRed(`⚠️  ${link[i].num} ${link[i].fileName} - 콘텐츠를 찾을 수 없어 건너뜁니다.`);
                continue;
            }
            
            // 북토끼
            if (info.site === "booktoki") {
                await page.locator('#novel_content').wait();
                // 텍스트 가져오기
                let fileContent = await page.evaluate(() => {
                    const fileContent = document.querySelector('#novel_content').innerText;
                    return fileContent;
                });
                // 텍스트 저장. 이미 있다면 저장하지 않음.
                if (!fs.existsSync(`./북토끼/${info.contentTitle}/${link[i].num} ${link[i].fileName}.txt`))
                    saveBook(`./북토끼/${info.contentTitle}`, `${link[i].num} ${link[i].fileName}.txt`, fileContent);
            }
            // 뉴토끼, 마나토끼
            else {
                // waitForCaptchaSolved에서 이미 콘텐츠를 확인했지만, 추가로 안전하게 대기
                try {
                    await page.waitForSelector('.view-padding div img', { timeout: 10000 });
                } catch (error) {
                    // 타임아웃이 발생해도 계속 진행 (이미 waitForCaptchaSolved에서 확인했으므로)
                    consoleGrey('이미지 셀렉터 대기 중 타임아웃, 계속 진행합니다...');
                }
                // 이미지 가져오기
                let imgLists = await page.evaluate(() => {
                    // view-padding의 div의 img.
                    let imgLists = Array.from(document.querySelectorAll('.view-padding div img'));
                    let returnList = [];
                    // 화면에 보이지 않는 이미지라면 리스트에서 제거
                    for (let j = 0; j < imgLists.length;) {
                        if (imgLists[j].checkVisibility() === false)
                            imgLists.splice(j, 1);
                        else {
                            let src = imgLists[j].outerHTML
                            try {
                                // protocolDomain이 빠진 src이다.
                                src = `${src.match(/\/data[^"]+/)[0]}`;
                                const extension = src.match(/\.[a-zA-Z]+$/)[0]
                                returnList.push({ src, extension });
                            } 
                            catch (error) {}
                            j++;
                        }
                    }
                    return returnList;
                })
                console.log(`이미지 ${imgLists.length}개 감지`);
                let promiseList = [];
                // 이미지들을 다운로드한다.
                for (let j = 0; j < imgLists.length; j++) {
                    const path = `./${info.siteTitle}/${info.contentTitle}/${link[i].num} ${link[i].fileName}`;
                    const fileName = `${link[i].num} ${link[i].fileName} image${j.toString().padStart(4, '0')}${imgLists[j].extension}`;
                    // 이미지 다운. 있다면 다운하지 않는다.
                    if (!fs.existsSync(`${path}/${fileName}`))
                        promiseList.push(saveImage(page, path, fileName, `${info.protocolDomain}${imgLists[j].src}`));
                    // protocolDomain으로 바꿈으로서 CORS 해결
                }
                await Promise.all(promiseList);
            }
        }
    } catch (error) {
        console.log(error);
        await browser.close();
    } finally {
        await browser.close();
    }

}

analyseArguments();
main();
