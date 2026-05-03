import asyncio
import aiohttp

async def main():
    async with aiohttp.ClientSession() as session:
        headers = {'User-Agent': 'Mozilla/5.0'}
        async with session.get('https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw', headers=headers) as r:
            text = await r.text()
            print('Status:', r.status)
            print('Length:', len(text))
            if r.status != 200:
                print('Content:', text[:200])

asyncio.run(main())
