import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  AppealDecision as AppealDecisionEvent,
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
  
  let round = new Round(event.params._disputeID.toHex()+"-"+BigInt.fromI32(0).toHex())
  round.dispute = event.params._disputeID.toHex()
  round.startTime = event.block.timestamp
  round.winningChoice = getVoteCounter(event.params._disputeID, BigInt.fromI32(0), event.transaction.from)
  round.save()

  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  entity.subcourtID = disputeData.value0
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriod(disputeData.value3)
  entity.startTime = event.block.timestamp
  entity.ruled = false
  entity.rounds = [round.id]
  entity.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID
  let id = disputeID.toHex() + "-" + voteID.toHex()
  let round = Round.load(disputeID.toHex() + "-" + roundNumber.toHex())
  let entity = new Vote(id)
  entity.address = event.params._address
  entity.disputeID = disputeID
  entity.round = round.id
  entity.voteID = voteID
  entity.choice = BigInt.fromI32(0)
  entity.voted = false
  entity.save()
}

export function handleNewPeriod(event: NewPeriodEvent): void {
  
  let disputeID = event.params._disputeID
  log.debug("handleNewPeriod: new period for the dispute {}", [disputeID.toString()])
  let entity = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  entity.newPeriod = getPeriod(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  let dispute = Dispute.load(disputeID.toHex())
  dispute.period = getPeriod(event.params._period)
  if (event.params._period == 4) {
    dispute.ruled = true
  }
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
  let dispute = Dispute.load(disputeID.toHex())
  let roundNum = dispute.rounds.length -1

  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    log.info("Storing the vote {} from dispute {}",[voteIDs[i].toString(), disputeID.toString()])
    let vote = Vote.load(disputeID.toHex() + "-" + voteIDs[i].toHex())
    vote.choice = choice
    vote.salt = salt

    vote.voted = true
    vote.save()
  } 

  // update dispute current rulling
  
  dispute.currentRulling = getCurrentRulling(disputeID, call.from)
  dispute.save()

}

export function handlePolicyUpdate(event: PolicyUpdateEvent): void {

}

export function handleAppealDecision(event: AppealDecisionEvent): void{
  // Event  raised when a dispute is appealed
  let disputeID = event.params._disputeID
  log.debug("New Appeal Decision raised for the dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toHex())
  let roundNum = dispute.rounds.length
  let round = new Round(disputeID.toHex()+"-"+BigInt.fromI32(roundNum).toHex())
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.winningChoice = getVoteCounter(disputeID, BigInt.fromI32(roundNum), event.transaction.from)
  round.save()

  // update new round in the dispute
  dispute.rounds.push(round.id)
  dispute.save()
}

function getPeriod(period: number): string {
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

function getCurrentRulling(disputeID: BigInt, address: Address): BigInt {
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

function getVoteCounter(disputeID: BigInt, round: BigInt, address: Address): BigInt {
  log.debug("Asking current rulling in the round {} of the dispute {}", [round.toString(), disputeID.toString()])
  let contract = KlerosLiquid.bind(address)
  let callResult = contract.try_getVoteCounter(disputeID, round)
  let winningChoice = BigInt.fromI32(0)
  if (callResult.reverted) {
    log.debug("voteCounter reverted", [])
  } else {
    winningChoice = callResult.value.value0
  }
  return winningChoice
}