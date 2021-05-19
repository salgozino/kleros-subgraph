import {
    log,
    TypedMap,
    Entity,
    Value,
    ValueKind,
    store,
    Address,
    Bytes,
    BigInt,
    BigDecimal,
    json,
    ipfs
  } from "@graphprotocol/graph-ts";
  
import {
    PolicyUpdate as NewPolicyUpdateEvent,
  } from "../generated/PolicyRegistry/PolicyRegistry"
import {
    PolicyUpdate,
  } from "../generated/schema"

export function handlePolicyUpdate(event: NewPolicyUpdateEvent): void {
  log.debug("Updating the policy of subcourt {}",[event.params._subcourtID.toString()])  
  let entity = new PolicyUpdate(
        event.transaction.hash.toHex() + "-" + event.logIndex.toString()
    )
    entity.subcourtID = event.params._subcourtID
    entity.policy = event.params._policy
    entity.contractAddress = event.address
    entity.timestamp = event.block.timestamp
    entity.blockNumber = event.block.number
    entity.save()
}
