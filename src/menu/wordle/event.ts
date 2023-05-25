import { client } from "init/client";
import wordle from "./lib";
import { BaseSession, Card } from "kasumi.js";
import axios from 'axios';
import sharp from 'sharp';

client.on('message.text', async (event) => {
    const wSession = wordle.getSession(event.channelId)
    if (wSession) {
        const session = new BaseSession([], event, client);
        const guess = event.content.trim().toLowerCase();
        if (guess.length == wSession.target.length && /^[a-zA-Z]+$/.test(guess)) {
            const card = new Card().setSize('sm');
            const { err, data } = await session.send(card);
            if (err) {
                return client.logger.error(err);
            }
            if (!wordle.checkWord(guess)) {
                card.addTitle(`你确定这真的是一个词语吗`);
            } else if (wSession.hasGuessed(guess)) {
                card.addTitle(`你已经猜过这个词啦`);
            } else {
                const { err: e, data: user } = await client.API.user.view(session.authorId);
                if (e) return client.logger.error(e);
                const avatar: Buffer = await sharp(await sharp((await axios({
                    url: user.avatar,
                    responseType: 'arraybuffer'
                })).data)
                    .resize(wSession.AVATAR_SIZE)
                    .png()
                    .ensureAlpha(1)
                    .composite([{
                        input: Buffer.from(
                            `<svg><rect x="0" y="0" width="${wSession.AVATAR_SIZE}" height="${wSession.AVATAR_SIZE}" rx="${wSession.AVATAR_SIZE}" ry="${wSession.AVATAR_SIZE}"/></svg>`
                        ),
                        blend: 'dest-in'
                    }])
                    .toBuffer())
                    .ensureAlpha(1)
                    .flatten({ background: 'white' })
                    .raw()
                    .toBuffer();
                const res = wSession.guess(guess, avatar);
                if (res) {
                    if (res.finished) {
                        if (res.win) {
                            card.addTitle("你赢了！");
                        } else {
                            card.addTitle("没有人猜出结果")
                        }
                        card.addText(`答案是：${wSession.target}`)
                            .addContext(`${wordle.words[wSession.target].中释}`)
                        wordle.finishGame(session.channelId);
                    }
                    const { err, data } = await client.API.asset.create(await wSession.draw());
                    if (err) return client.logger.error(err);
                    const { url } = data;
                    card.addImage(url);
                    card.addText(res.items.map(v => `(font)${v.character}(font)[${v.type == 'correct' ? 'success' : v.type == 'misplaced' ? 'warning' : 'secondary'}]`).join(""))
                } else {
                    card.addTitle(`你已经猜过这个词啦`);
                }
            }
            session.update(data.msg_id, card);
        }
    }
})