import { BaseCommand, BaseSession, Card, CommandFunction } from "kasumi.js";
import menu from "..";
import wordle from "../lib";

class AppCommand extends BaseCommand {
    name = 'stop';
    description = '强制停止 Wordle 游戏';
    func: CommandFunction<BaseSession, any> = async (session) => {
        wordle.finishGame(session.channelId);
        session.reply(new Card()
            .addTitle("已停止游戏")
        )
    }
}

const command = new AppCommand();
export default command;
menu.addCommand(command);