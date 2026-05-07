import asyncio, aiohttp
from backend.main import fetch_channel_rss, enhance_and_filter_videos, load_credentials, build

async def main():
    async with aiohttp.ClientSession() as s:
        _, videos = await fetch_channel_rss(s, 'UChfl3auNxAxOR3wy8a8ysQQ', 3)
        creds = load_credentials()
        yt = build('youtube', 'v3', credentials=creds)
        filtered = enhance_and_filter_videos(yt, videos)
        print([v['video_id'] for v in filtered])

if __name__ == "__main__":
    asyncio.run(main())
