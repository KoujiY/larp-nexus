import { NextRequest, NextResponse } from 'next/server';
import { getPusherServer, isPusherEnabled } from '@/lib/websocket/pusher-server';

export async function POST(req: NextRequest) {
  if (!isPusherEnabled()) {
    return NextResponse.json({ error: 'Pusher not configured' }, { status: 503 });
  }

  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json({ error: 'Pusher not available' }, { status: 503 });
  }

  // Pusher 會以 x-www-form-urlencoded 傳送 body，需支援 form 與 json
  let socketId: string | undefined;
  let channelName: string | undefined;
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await req.json();
    socketId = body.socket_id;
    channelName = body.channel_name;
  } else {
    const formData = await req.formData();
    socketId = formData.get('socket_id') as string | undefined;
    channelName = formData.get('channel_name') as string | undefined;
  }

  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
  }

  // 驗證頻道格式（只允許角色/劇本私有頻道）
  const isCharacterChannel = channelName.startsWith('private-character-');
  const isGameChannel = channelName.startsWith('private-game-');

  if (!isCharacterChannel && !isGameChannel) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 403 });
  }

  try {
    const auth = pusher.authorizeChannel(socketId, channelName);
    return NextResponse.json(auth);
  } catch (error) {
    console.error('[pusher] auth error', error);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}

