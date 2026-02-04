/**
 * Discord Webhook 通知スクリプト
 * 朝のサマリーやタスクアラートを送信
 */

import 'dotenv/config';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * Discordにメッセージを送信
 */
async function sendMessage(content, embeds = []) {
    const payload = {};

    if (content) {
        payload.content = content;
    }

    if (embeds.length > 0) {
        payload.embeds = embeds;
    }

    const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Discord webhook error: ${response.status} ${text}`);
    }

    return true;
}

/**
 * 朝のサマリーを送信
 */
async function sendMorningSummary({ tasks, events, shifts }) {
    const today = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    });

    const embeds = [
        {
            title: `📅 ${today}`,
            color: 0x5865F2, // Discord Blurple
            fields: [],
            timestamp: new Date().toISOString(),
        },
    ];

    // タスク情報
    if (tasks && tasks.length > 0) {
        const taskList = tasks.slice(0, 5).map(t =>
            `• [${t.identifier}] ${t.title}`
        ).join('\n');

        embeds[0].fields.push({
            name: `📋 今日のタスク (${tasks.length}件)`,
            value: taskList + (tasks.length > 5 ? `\n...他${tasks.length - 5}件` : ''),
            inline: false,
        });
    } else {
        embeds[0].fields.push({
            name: '📋 今日のタスク',
            value: '期限が今日のタスクはありません',
            inline: false,
        });
    }

    // 予定情報
    if (events && events.length > 0) {
        const eventList = events.slice(0, 5).map(e => {
            const time = e.isAllDay ? '終日' : `${e.startTime}〜${e.endTime}`;
            return `• ${time} ${e.summary}`;
        }).join('\n');

        embeds[0].fields.push({
            name: `📆 今日の予定 (${events.length}件)`,
            value: eventList + (events.length > 5 ? `\n...他${events.length - 5}件` : ''),
            inline: false,
        });
    } else {
        embeds[0].fields.push({
            name: '📆 今日の予定',
            value: '予定はありません',
            inline: false,
        });
    }

    // シフト情報
    if (shifts && shifts.length > 0) {
        const shiftList = shifts.map(s => {
            // シフトのオブジェクトを文字列化
            const values = Object.values(s).filter(v => v).join(' | ');
            return `• ${values}`;
        }).join('\n');

        embeds[0].fields.push({
            name: `🏫 今日のシフト (${shifts.length}件)`,
            value: shiftList,
            inline: false,
        });
    }

    await sendMessage(null, embeds);
}

/**
 * シンプルな通知を送信
 */
async function sendNotification(title, message, color = 0x5865F2) {
    const embeds = [
        {
            title,
            description: message,
            color,
            timestamp: new Date().toISOString(),
        },
    ];

    await sendMessage(null, embeds);
}

// メイン実行
async function main() {
    if (!WEBHOOK_URL) {
        console.error('Error: DISCORD_WEBHOOK_URL is not set in .env');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const action = args[0] || 'test';

    try {
        switch (action) {
            case 'test':
                // テスト通知
                await sendNotification(
                    '🔔 Workspace通知テスト',
                    'Discord Webhookが正常に動作しています！',
                    0x57F287 // Green
                );
                console.log('Test notification sent successfully');
                break;

            case 'summary':
                // 標準入力からJSONデータを受け取る場合
                let inputData = '';
                for await (const chunk of process.stdin) {
                    inputData += chunk;
                }

                if (inputData) {
                    const data = JSON.parse(inputData);
                    await sendMorningSummary(data);
                    console.log('Morning summary sent successfully');
                } else {
                    // デモ用のダミーデータ
                    await sendMorningSummary({
                        tasks: [
                            { identifier: 'WS-1', title: 'サンプルタスク1' },
                            { identifier: 'WS-2', title: 'サンプルタスク2' },
                        ],
                        events: [
                            { summary: 'ミーティング', startTime: '10:00', endTime: '11:00', isAllDay: false },
                        ],
                        shifts: [],
                    });
                    console.log('Demo summary sent successfully');
                }
                break;

            case 'alert':
                const title = args[1] || '通知';
                const message = args[2] || 'メッセージなし';
                await sendNotification(`⚠️ ${title}`, message, 0xFEE75C); // Yellow
                console.log('Alert sent successfully');
                break;

            default:
                console.log('Usage:');
                console.log('  node discord-notify.mjs test');
                console.log('  node discord-notify.mjs summary');
                console.log('  node discord-notify.mjs alert <title> <message>');
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
