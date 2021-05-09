import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  CastVoteCall,
  KlerosLiquid, CreateSubcourtCall,
  
} from "../generated/KlerosLiquid/KlerosLiquid"
import {
  PolicyUpdate as PolicyUpdateEvent
} from "../generated/PolicyRegistry/PolicyRegistry"
import {
  StakeSet,
  Draw,
  NewPeriod,
  TokenAndETHShift,
  Vote,
  Round,
  Dispute
} from "../generated/schema"
import {
  log,
  TypedMap,
  Entity,
  store,
  Address,
  Bytes,
  BigInt,
  BigDecimal,
  json,
  ipfs
} from "@graphprotocol/graph-ts";


// Phase constants
// const EVIDENCE = 'evidence';
// const COMMIT = 'commit';
// const VOTE = 'vote';
// const APPEAL = 'appeal';
// const EXECUTION = 'execution';
enum Period {
  evidence = 0,
  commit,
  vote,
  appeal,
  execution
}


export function handleStakeSet(event: StakeSetEvent): void {
  let entity = new StakeSet(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  entity.address = event.params._address
  entity.subcourtID = event.params._subcourtID
  entity.stake = event.params._stake
  entity.newTotalStake = event.params._newTotalStake
  entity.save()
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  let entity = new Dispute(event.params._disputeID.toHex())
  entity.arbitrable = event.params._arbitrable
  entity.creator = event.transaction.from
  
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  entity.subcourtID = disputeData.value0
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriod(disputeData.value3)
  entity.startTime = event.block.timestamp
  entity.ruled = false
  entity.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID
  let id = disputeID.toHex() + "-" + voteID.toHex()
  let entity = new Vote(id)
  entity.address = event.params._address
  entity.disputeID = disputeID
  entity.round = roundNumber
  entity.voteID = voteID
  entity.choice = BigInt.fromI32(0)
  entity.voted = false
  entity.save()
}

export function handleNewPeriod(event: NewPeriodEvent): void {
  
  let disputeID = event.params._disputeID
  log.info("handleNewPeriod: new period for the dispute {}", [disputeID.toString()])
  let entity = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  entity.newPeriod = getPeriod(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  let dispute = new Dispute(disputeID.toHex())
  dispute.period = getPeriod(event.params._period)
  dispute.lastPeriodChange = event.block.timestamp
  
  // update current rulling
  dispute.currentRulling = getCurrentRulling(disputeID, event.address)
  dispute.save()

}

export function handleTokenAndETHShift(event: TokenAndETHShiftEvent): void {
  
}

export function handleCastVote(call: CastVoteCall): void {
  let disputeID = call.inputs._disputeID
  let choice = call.inputs._choice
  let voteIDs = call.inputs._voteIDs
  let salt = call.inputs._salt

  for (let i = 0; i < voteIDs.length; i++) {
    log.info("Storing the vote {} from dispute {}",[voteIDs[i].toString(), disputeID.toString()])
    let vote = new Vote(disputeID.toHex() + "-" + voteIDs[i].toHex())
    vote.choice = choice
    vote.salt = salt
    vote.voted = true
    vote.save()
  } 

  // update current rulling
  let dispute = new Dispute(disputeID.toHex())
  dispute.currentRulling = getCurrentRulling(disputeID, call.from)
  dispute.save()
}

export function handlePolicyUpdate(event: PolicyUpdateEvent): void {

}

export function getPeriod(period: number): string {
  if (period == 0) {
    return 'evidence'
  }
  else if (period == 1){
    return 'commit'
  }
  else if (period == 2){
    return 'vote'
  }
  else if (period == 3){
    return 'appeal'
  }
  else if (period == 4){
    return 'execution'
  }
  return ''

}

export function getCurrentRulling(disputeID: BigInt, address: Address): BigInt {
    // update current rulling
    log.debug("Asking current rulling in dispute {}", [disputeID.toString()])
    let contract = KlerosLiquid.bind(address)
    let callResult = contract.try_currentRuling(disputeID)
    let currentRulling = BigInt.fromI32(0)
    if (callResult.reverted) {
      log.debug("currentRulling reverted", [])
    } else {
      currentRulling = callResult.value
    }
    return currentRulling
}