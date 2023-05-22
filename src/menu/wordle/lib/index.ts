import * as fs from 'fs';
import upath from 'upath';
import crypto from 'crypto';
import { Image, ImageData, createCanvas } from 'canvas';
import schedule from 'node-schedule';
import { Card, MessageType } from 'kasumi.js';
import { client } from 'init/client';
import axios from 'axios';
import sharp from 'sharp';

interface ResultItem {
    type: "correct" | "misplaced" | "wrong";
    character: string;
    author: Buffer;
}

interface GuessResult {
    finished: boolean,
    win: boolean,
    items: ResultItem[]
}

export class Wordle {
    words: {
        [word: string]: {
            中释: string,
            英释: string
        },
    } = {};
    dictionary: {
        [word: string]: 1
    } = {};

    constructor() {
        const files = fs.readdirSync(upath.join(__dirname, 'words'))
        for (const file of files) {
            if (file.endsWith(".json") && file.includes("CET")) {
                const dictionaryRaw = fs.readFileSync(upath.join(__dirname, 'words', file), { encoding: 'utf-8' });
                this.words = {
                    ...this.words,
                    ...JSON.parse(dictionaryRaw)
                }
            }
        }
        const dictionaryRaw = fs.readFileSync(upath.join(__dirname, 'dictionary', 'words_dictionary.json'), { encoding: 'utf8' });
        this.dictionary = JSON.parse(dictionaryRaw);
    }

    channelSession: {
        [channelId: string]: WordleSession
    } = {};

    public getSession(channelId: string): WordleSession | undefined {
        const session = this.channelSession[channelId];
        if (session && !session.failed) {
            return session;
        } else {
            this.finishGame(channelId);
        }
    }

    public checkWord(word: string) {
        return Object.keys(this.dictionary).includes(word);
    }

    public guess(channelId: string, guess: string, user: Buffer) {
        const session = this.getSession(channelId);
        if (session) {
            return session.guess(guess, user);
        }
    }

    public getRandomWord(length: number) {
        const filtered = Object.keys(this.words).filter(v => v.length == length);
        return filtered[crypto.randomInt(filtered.length)].toLowerCase();
    }

    public newGame(channelId: string, length: number) {
        const session = this.getSession(channelId);
        if (session) {
            return false;
        } else {
            this.channelSession[channelId] = new WordleSession(this.getRandomWord(length), channelId);
            return true;
        }
    }

    public finishGame(channelId: string) {
        this.channelSession[channelId]?.job?.cancel();
        delete this.channelSession[channelId];
    }
}

export class WordleSession {
    job?: schedule.Job;

    historyPlain: string[] = [];
    history: Array<ResultItem[]> = [];

    target: string;
    channelId: string;

    private readonly WIDTH: number;
    private readonly HEIGHT: number;

    private readonly _BLOCK_GAP = 15;
    private readonly _BLOCK_SIZE = 50;
    private readonly _BORDER_WIDTH = 5;
    private readonly _BEZEL_SIZE = 30;

    private get FONT_SIZE() {
        return (this._BLOCK_SIZE - 8) * this.SCALE;
    }
    private get DRAW_WIDTH() {
        return this.BEZEL_SIZE * 2 + this.BLOCK_SIZE * this.WIDTH + this.BLOCK_GAP * (this.WIDTH - 1) + this.AVATAR_SIZE;
    }
    private get DRAW_HEIGHT() {
        return this.BEZEL_SIZE * 2 + this.BLOCK_SIZE * this.HEIGHT + this.BLOCK_GAP * (this.HEIGHT - 1);
    }


    private readonly SCALE = 4;

    private get BLOCK_GAP() { return this._BLOCK_GAP * this.SCALE };
    private get BLOCK_SIZE() { return this._BLOCK_SIZE * this.SCALE };
    private get BORDER_WIDTH() { return this._BORDER_WIDTH * this.SCALE };
    private get BEZEL_SIZE() { return this._BEZEL_SIZE * this.SCALE };
    public get AVATAR_SIZE() { return this.BLOCK_SIZE - this.BORDER_WIDTH };

    constructor(target: string, channelId: string) {
        this.target = target;
        this.channelId = channelId;
        this.WIDTH = target.length;
        this.HEIGHT = target.length + 1;

        this.scheduleFinish();
    }

    private scheduleFinish() {
        this.job?.cancel();
        this.job = schedule.scheduleJob(new Date(Date.now() + 5 * 60 * 1000), () => {
            client.API.message.create(
                MessageType.CardMessage,
                this.channelId,
                new Card()
                    .addTitle("超时没有人猜出结果")
                    .addText(`答案是：${this.target}`)
                    .addContext(`${wordle.words[this.target].中释}`)
            )
            wordle.finishGame(this.channelId);
        })
    }

    public async draw(): Promise<Buffer> {
        const canvas = createCanvas(this.DRAW_WIDTH, this.DRAW_HEIGHT);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, this.DRAW_WIDTH, this.DRAW_HEIGHT);
        ctx.lineWidth = this.BORDER_WIDTH;
        for (let i = 1; i <= this.HEIGHT; ++i) {
            const column = this.history[i - 1];
            for (let j = 1; j <= this.WIDTH; ++j) {
                ctx.strokeStyle = 'rgb(123, 123, 124)';
                ctx.strokeRect(
                    this.AVATAR_SIZE + this.BEZEL_SIZE + (j - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE),
                    this.BEZEL_SIZE + (i - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE),
                    this.BLOCK_SIZE,
                    this.BLOCK_SIZE
                )
                if (column) {
                    const item = column[j - 1];
                    if (item) {
                        const iData = new ImageData(Uint8ClampedArray.from(item.author), this.AVATAR_SIZE, this.AVATAR_SIZE);
                        ctx.putImageData(
                            iData,
                            this.BEZEL_SIZE / 2,
                            this.BEZEL_SIZE + (i - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE) + this.BORDER_WIDTH / 2
                        )
                        ctx.fillStyle = item.type == 'correct' ? 'rgb(134, 163, 115)' : item.type == 'misplaced' ? 'rgb(198, 182, 108)' : 'rgb(123, 123, 123)';
                        ctx.fillRect(
                            this.AVATAR_SIZE + this.BEZEL_SIZE + (j - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE) + this.BORDER_WIDTH / 2,
                            this.BEZEL_SIZE + (i - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE) + this.BORDER_WIDTH / 2,
                            this.BLOCK_SIZE - this.BORDER_WIDTH,
                            this.BLOCK_SIZE - this.BORDER_WIDTH
                        );
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = "center";
                        ctx.font = `${this.FONT_SIZE}px Courier Prime`;
                        ctx.fillStyle = 'white';
                        ctx.fillText(
                            item.character.toUpperCase(),
                            this.AVATAR_SIZE + this.BEZEL_SIZE + (j - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE) + this.BLOCK_SIZE / 2,
                            this.BEZEL_SIZE + (i - 1) * (this.BLOCK_GAP + this.BLOCK_SIZE) + this.BLOCK_SIZE / 2 + 2 * this.SCALE,
                            this.BLOCK_SIZE
                        );
                    }
                }
            }
        }
        return canvas.toBuffer();
    }

    public get failed() {
        return this.history.length >= this.target.length + 1;
    }
    public get rounds() {
        return this.history.length;
    }

    private setCharAt(str: string, index: number, chr: string) {
        if (index > str.length - 1) return str;
        return str.substring(0, index) + chr + str.substring(index + 1);
    }

    public hasGuessed(guess: string) {
        return this.historyPlain.includes(guess);
    }

    public guess(payload: string, user: Buffer): GuessResult {
        this.scheduleFinish();
        this.historyPlain.push(payload);
        let target = this.target, guess = payload;
        let res: ResultItem[] = new Array(target.length);
        if (guess == this.target) {
            res = guess.split("").map(v => {
                return {
                    type: "correct",
                    character: v,
                    author: user
                }
            });
            this.history.push(res);
            return {
                finished: true,
                win: true,
                items: res
            }
        }
        for (let i = 0; i < this.target.length; ++i) {
            if (target.charAt(i) == guess.charAt(i)) {
                target = this.setCharAt(target, i, '0');
                guess = this.setCharAt(guess, i, '1');
                res[i] = {
                    type: "correct",
                    character: payload.charAt(i),
                    author: user
                };
            }
        }
        for (let i = 0; i < this.target.length; ++i) {
            if (
                !(target.charAt(i) == guess.charAt(i)) &&
                target.includes(guess.charAt(i))
            ) {
                target = this.setCharAt(target, target.indexOf(guess.charAt(i)), '0');
                res[i] = {
                    type: "misplaced",
                    character: payload.charAt(i),
                    author: user
                };
            } else if (!res[i]) {
                res[i] = {
                    type: "wrong",
                    character: payload.charAt(i),
                    author: user
                };
            }
        }
        this.history.push(res);
        return {
            finished: this.failed,
            win: false,
            items: res
        }
    }
}

const wordle = new Wordle();
export default wordle;