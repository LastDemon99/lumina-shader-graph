import asyncio
from src.agent_adk import GraphAgentAdk
graph={'nodes':[{'id':'output','type':'output','x':0,'y':0,'data':{}}],'connections':[]}
messages=[{'role':'user','content':'Add a color node and connect it to output color.'}]
async def main():
    agent=GraphAgentAdk()
    r=await agent.process_request(messages, graph)
    print('message:', r.message)
    print('ops:', len(r.operations))
    print('op kinds:', [o.op for o in r.operations])
    print('ops detail:', [(o.op, getattr(o,'nodeType',None), getattr(o,'nodeId',None), getattr(o,'targetNodeId',None)) for o in r.operations])
    print('trace:', (r.thought_process or '')[:1200])
asyncio.run(main())
