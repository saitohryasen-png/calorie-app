import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたは料理のカロリー推定の専門家です。
各料理のカロリーを推定し、以下のJSON形式のみで返してください。前置きやMarkdownは不要です。

{
  "dishes": [
    {"name": "料理名", "kcal_min": 数値, "kcal_max": 数値}
  ],
  "total_min": 合計最小値,
  "total_max": 合計最大値,
  "comment": "全体的な一言コメント（50文字以内）"
}`;

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mediaType, textInput } = await req.json();

    const content: Anthropic.MessageParam['content'] = textInput
      ? [{ type: 'text', text: `次の食事のカロリーを推定してください。\n\n${textInput}` }]
      : [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: 'この料理のカロリーを推定してください。' },
        ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: '分析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}