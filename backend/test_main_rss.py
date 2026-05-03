import asyncio
import aiohttp
from main import fetch_channel_rss

async def test():
    async with aiohttp.ClientSession() as session:
        cid, vids = await fetch_channel_rss(session, "UC_x5XG1OV2P6uZZ5FSM9Ttw", 5, "Test Channel")
        print("Channel:", cid)
        print("Found videos:", len(vids))
        for v in vids:
            print(v)

asyncio.run(test())
