import { BaseCommand, BaseSession, Card, CommandFunction } from "kasumi.js";
import menu from "..";
import wordle from "../lib";

class AppCommand extends BaseCommand {
    name = 'start';
    description = '开始 Wordle 游戏';
    func: CommandFunction<BaseSession, any> = async (session) => {
        let length = parseInt(session.args[0]);
        if (isNaN(length)) length = 5;
        if (length < 3) length = 3;
        if (length > 9) length = 9;
        if (wordle.newGame(session.channelId, length)) {
            const wSession = wordle.getSession(session.channelId);
            if (wSession) {
                const { err, data } = await this.client.API.asset.create(wSession.draw());
                if (err) throw err;
                const { url } = data;
                const card = new Card()
                    .setSize('sm')
                    .addTitle("开始 Wordle")
                    // .addText(`题目为 ${wSession.target}`)
                    .addText(`单词长度为 ${length}，你有 ${length + 1} 次机会`)
                return session.update(
                    (await session.send(card)).data?.msg_id || '',
                    card.addImage(url)
                );
            } else {
                return session.reply(new Card()
                    .addTitle("开始 Wordle 出错")
                );
            }
        } else {
            return session.reply(new Card()
                .addTitle("已有正在进行的游戏")
            );
        }
    }
}

const command = new AppCommand();
export default command;
menu.addCommand(command);