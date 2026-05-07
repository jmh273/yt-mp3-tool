import asyncio
from backend.main import get_latest_videos

async def main():
    res = await get_latest_videos()
    vids = [v['video_id'] for v in res['videos']]
    print(len(vids), vids)
    if 'a7Mem6K-wZM' in vids:
        print("FOUND")
    else:
        print("NOT FOUND")

if __name__ == "__main__":
    asyncio.run(main())
