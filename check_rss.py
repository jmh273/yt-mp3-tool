import asyncio, aiohttp
from backend.main import fetch_channel_rss

async def main():
    async with aiohttp.ClientSession() as s:
        _, v = await fetch_channel_rss(s, 'UChfl3auNxAxOR3wy8a8ysQQ', 10)
        for item in v:
            print(item['title'], item['video_id'], item['published'])

if __name__ == "__main__":
    asyncio.run(main())
