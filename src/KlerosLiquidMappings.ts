import {
  StakeSet as StakeSetEvent,
  DisputeCreation as DisputeCreationEvent,
  Draw as DrawEvent,
  NewPeriod as NewPeriodEvent,
  TokenAndETHShift as TokenAndETHShiftEvent,
  AppealDecision as AppealDecisionEvent,
  CastVoteCall,
  KlerosLiquid, 
  CreateSubcourtCall,
  ChangeSubcourtMinStakeCall,
  ChangeSubcourtAlphaCall,
  ChangeSubcourtJurorFeeCall,
  ChangeSubcourtJurorsForJumpCall,
  ChangeSubcourtTimesPerPeriodCall,
  ExecuteRulingCall,
  ChangeSubcourtTimesPerPeriodCall__Inputs
} from "../generated/KlerosLiquid/KlerosLiquid"
import {
  StakeSet,
  Draw,
  NewPeriod,
  Vote,
  Round,
  Dispute,
  Court,
  KlerosCounter,
  Juror,
  CourtStake
} from "../generated/schema"
import {
  log,
  Address,
  BigInt
} from "@graphprotocol/graph-ts";


// Phase constants
enum Period {
  evidence = 0,
  commit,
  vote,
  appeal,
  execution
}

export function handleStakeSet(event: StakeSetEvent): void {
  log.debug("handleSetStake: creating a new setStake", [])
  let entity = new StakeSet(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  let juror = getOrCreateJuror(event.params._address, event.params._subcourtID, event.params._newTotalStake, event.address)
  entity.address = event.params._address
  entity.subcourtID = event.params._subcourtID
  entity.stake = event.params._stake
  entity.newTotalStake = event.params._newTotalStake
  entity.save()
  log.info("handleStakeSet: stake set stored",[])
  
  // update all stakes from juror. This should be done with a derivedForm. Next TODO
  let allStakes = juror.allStakes
  allStakes.push(entity.id)
  juror.allStakes = allStakes
  juror.save()

  // Create CourtStake entity
  getOrCreateCourtStake(entity.subcourtID, entity.stake, event.params._address, event.block.timestamp, event.block.number, event.address)

  // update the stake
  updateJurorStake(event.params._address, event.params._subcourtID, event.params._stake, event.params._newTotalStake, event.block.timestamp, event.block.number, event.address)
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  log.debug("handleDisputeCreation: Creating a new dispute with id {}", [event.params._disputeID.toString()])
  let entity = new Dispute(event.params._disputeID.toString())
  entity.disputeID = event.params._disputeID
  entity.arbitrable = event.params._arbitrable
  
  log.debug("handleDisputeCreation: asking the dispute {} to the contract", [event.params._disputeID.toString()])
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  let creator = getOrCreateJuror(event.transaction.from, null, BigInt.fromI32(0), event.address)
  entity.creator = creator.id
  court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
  court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
  court.save()

  entity.subcourtID = court.id
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriod(disputeData.value3)
  entity.startTime = event.block.timestamp
  entity.ruled = disputeData.value7
  log.debug("handleDisputeCreation: saving dispute {} entity",[event.params._disputeID.toString()])
  entity.save()
  
  // round creation
  log.debug("handleDisputeCreation: Creating the round 0 for the dispute {}", [event.params._disputeID.toString()])
  let round = new Round(event.params._disputeID.toString()+"-"+BigInt.fromI32(0).toString())
  round.dispute = entity.id
  round.startTime = event.block.timestamp
  round.winningChoice = getVoteCounter(event.params._disputeID, BigInt.fromI32(0), event.transaction.from)
  log.debug("handleDisputeCreation: saving the round 0 for the dispute {}", [event.params._disputeID.toString()])
  round.save()

  //update counters
  let kc = getOrInitializeKlerosCounter()
  log.debug("handleDisputeCreation: Updating KlerosCounters", [])
  kc.disputesCount = kc.disputesCount.plus(BigInt.fromI32(1))
  kc.openDisputes = kc.openDisputes.plus(BigInt.fromI32(1))
  kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  kc.save()
}

export function handleDraw(event: DrawEvent): void {
  let disputeID = event.params._disputeID
  let roundNumber = event.params._appeal
  let voteID = event.params._voteID
  log.info("handleDraw: Creating draw entity. disputeID={}, voteID={}, roundNumber={}", [disputeID.toString(), voteID.toString(), roundNumber.toString()])
  let drawID = disputeID.toString()+"-"+voteID.toString()
  // create draw Entity
  let drawEntity = new Draw(drawID)
  drawEntity.address = event.params._address
  drawEntity.disputeId = event.params._disputeID
  drawEntity.roundNumber = event.params._appeal
  drawEntity.voteId = voteID
  drawEntity.timestamp = event.block.timestamp
  drawEntity.save()
  log.info("handleDraw: drawEntity stored",[])
  // create Vote entity
  log.info("handleDraw: Creating vote entity, id={} for the round {}", [drawID, roundNumber.toString()])
  let round = Round.load(disputeID.toString() + "-" + roundNumber.toString())
  let dispute = Dispute.load(disputeID.toString())
  log.debug("handleDraw: loaded round id is {}", [round.id])
  log.debug("handleDraw: loaded dispute id is {}", [dispute.id])
  let entity = new Vote(drawID)
  let court = Court.load(dispute.subcourtID)
  let juror = getOrCreateJuror(event.params._address, BigInt.fromString(court.id), BigInt.fromI32(0), event.address)
  entity.address = juror.id
  entity.dispute = dispute.id
  entity.round = round.id
  entity.voteID = voteID
  // define choice 0 and not voted
  entity.choice = BigInt.fromI32(0)
  entity.voted = false
  entity.save()
  log.debug("handleDraw: vote entity stored",[])

  // it's the first vote of this juror?
  // TODO!: numberofDisputesAsjuror is not been calculated, so always will be true this condition
  if (juror.numberOfDisputesAsJuror.equals(BigInt.fromI32(0))){
    let kc = getOrInitializeKlerosCounter()
    log.debug("handleDraw: First time the juror {} is in a dispute, updating the global counter",[juror.id])
    kc.drawnJurors = kc.drawnJurors.plus(BigInt.fromI32(1))
    kc.save()
  }

}

export function handleCastVote(call: CastVoteCall): void {
  let disputeID = call.inputs._disputeID
  let voteIDs = call.inputs._voteIDs
  log.debug("handleCastVote: Casting vote from dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null){
    log.error("handleCastVote: Error trying to load the dispute with id {}. The vote will not be stored", [disputeID.toString()])
    return
  }
  
  // update votes
  for (let i = 0; i < voteIDs.length; i++) {
    let id = disputeID.toString()+"-"+voteIDs[i].toString()
    log.debug("handleCastVote: Storing the vote {}",[id])
    let vote = Vote.load(id)
    if (vote == null){
      log.error("handleCastVote: Error trying to load the vote with id {}. The vote will not be stored", [id])
    }
    else{
      vote.choice = call.inputs._choice
      vote.salt = call.inputs._salt
      vote.voted = true
      vote.timestamp = call.block.timestamp
      vote.save()
    }
  } 

  // update dispute current rulling
  log.debug("handleCastVote: updating current rulling in the dispute {}",[disputeID.toString()])
  dispute.currentRulling = getCurrentRulling(disputeID, call.to)
  dispute.save()
}

export function handleNewPeriod(event: NewPeriodEvent): void {
  let disputeID = event.params._disputeID
  log.debug("handleNewPeriod: new period for the dispute {}", [disputeID.toString()])
  let entity = new NewPeriod(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  entity.newPeriod = getPeriod(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  log.debug("handleNewPeriod: Updating the dispute {} information", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null){
    log.error("handleNewPeriod: Error trying to load the dispute with id {}. The new period will not be stored", [disputeID.toString()])
    return
  }
  dispute.period = getPeriod(event.params._period)
  let kc = getOrInitializeKlerosCounter()
  if (event.params._period == 4) {
    dispute.ruled = true
    let court = Court.load(dispute.subcourtID)
    log.debug("handleNewPeriod: Updating disputes ongoing and closed in court {}", [court.id])
    court.disputesOngoing = court.disputesOngoing.minus(BigInt.fromI32(1))
    court.disputesClosed = court.disputesClosed.plus(BigInt.fromI32(1))
    court.save()
    // update counters
    log.debug("handleNewPeriod: Updating kleros counter parameters in period 4", [])
    kc.openDisputes = kc.openDisputes.minus(BigInt.fromI32(1))
    kc.closedDisputes = kc.closedDisputes.plus(BigInt.fromI32(1))
    kc.appealPhaseDisputes = kc.appealPhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  } else if (event.params._period==3){
    // moving to appeal phase
    log.debug("handleNewPeriod: Updating kleros counter parameters in period 3", [])
    kc.appealPhaseDisputes = kc.appealPhaseDisputes.plus(BigInt.fromI32(1))
    kc.votingPhaseDisputes = kc.votingPhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  } else if (event.params._period==2){
    log.debug("handleNewPeriod: Updating kleros counter parameters in period 2", [])
    // moving to voting phase (from the evidence phase)
    kc.votingPhaseDisputes = kc.votingPhaseDisputes.plus(BigInt.fromI32(1))
    kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  }
  
  dispute.lastPeriodChange = event.block.timestamp
  
  // update current rulling
  dispute.currentRulling = getCurrentRulling(disputeID, event.address)
  dispute.save()
}

export function handleTokenAndETHShift(event: TokenAndETHShiftEvent): void {
  
}

export function handleAppealDecision(event: AppealDecisionEvent): void{
  // Event  raised when a dispute is appealed
  let disputeID = event.params._disputeID
  log.info("handleAppealDecision: New Appeal Decision raised for the dispute {}", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null){
    log.error("handleAppealDecision: Error trying to load the dispute with id {}. The appeal will not be stored", [disputeID.toString()])
    return
  }
  log.debug("handleAppealDecision: Dispute loaded with id {}",[dispute.id])
  
  // Iterate searching for the last round in this dispute
  let roundNum = BigInt.fromI32(0)
  let roundID = disputeID.toString()+"-"+roundNum.toString()
  let lastround = Round.load(roundID)
  do {
    roundNum = roundNum.plus(BigInt.fromI32(1))
    roundID = disputeID.toString()+"-"+roundNum.toString()
    log.debug("handleAppealDecision: searching for roundID {}",[roundID])
    lastround = Round.load(roundID)
  }
  while (lastround != null);

  log.debug("handleAppealDecision: new round number is {}. Round id = {}", [roundNum.toString(), roundID])
  let round = new Round(roundID)
  round.dispute = dispute.id
  round.startTime = event.block.timestamp
  round.winningChoice = BigInt.fromI32(0) // initiate in pending
  round.save()
  // Check if dispute is not jumped to parent court
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(disputeID)
  
  let oldcourt = Court.load(dispute.subcourtID)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  if (oldcourt != court){
    log.debug("handleAppealDecision: Court Jump!", [])
    dispute.subcourtID = court.id
    dispute.save()
    // update oldcourt counters
    oldcourt.disputesOngoing = oldcourt.disputesOngoing.minus(BigInt.fromI32(1))
    oldcourt.disputesNum = oldcourt.disputesNum.minus(BigInt.fromI32(1))
    oldcourt.save()
    // update new court counters
    court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
    court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
    court.save()
  }
  // Update KlerosCounters
  let kc = getOrInitializeKlerosCounter()
  kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.plus(BigInt.fromI32(1))
  kc.appealPhaseDisputes = kc.appealPhaseDisputes.minus(BigInt.fromI32(1))
  kc.save()
}

export function handleCreateSubcourt(call: CreateSubcourtCall): void {
  log.debug("handleCreateSubcourt: Asking for current court count", [])
  let kc = getOrInitializeKlerosCounter()
  
  log.debug("handleCreateSubcourt: Creating new court with id {}", [kc.courtsCount.toString()])
  getOrCreateCourt(kc.courtsCount, call.to)
  // if the court it's created, the counter of KlerosCounter is incremented wihtin the getorCreateCourt
}


export function handleChangeSubcourtMinStake(call: ChangeSubcourtMinStakeCall): void {
  log.debug("handleChangeSubcourtMinStake: Updating minstake of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.minStake = call.inputs._minStake
  court.save()
}

export function handleChangeSubcourtAlpha(call: ChangeSubcourtAlphaCall): void {
  log.debug("handleChangeSubcourtAlpha: Updating alpha of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.alpha = call.inputs._alpha
  court.save()
}

export function handleChangeSubcourtJurorFee(call: ChangeSubcourtJurorFeeCall): void {
  log.debug("handleChangeSubcourtJurorFee: Updating jurorfees of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.feeForJuror = call.inputs._feeForJuror
  court.save()
}

export function handleChangeSubcourtJurorsForJump(call: ChangeSubcourtJurorsForJumpCall): void {
  log.debug("handleChangeSubcourtJurorsForJump: Updating jurorforJump of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.jurorsForCourtJump = call.inputs._jurorsForCourtJump
  court.save()
}

export function handleChangeSubcourtTimesPerPeriod(call: ChangeSubcourtTimesPerPeriodCall): void {
  log.debug("handleChangeSubcourtTimesPerPeriod: Updating timesPerPeriod of court {}", [call.inputs._subcourtID.toString()])
  let court = getOrCreateCourt(call.inputs._subcourtID, call.to)
  court.timePeriods = call.inputs._timesPerPeriod
  court.save()
}

export function handleExecuteRuling(call: ExecuteRulingCall): void{
  log.debug("handleExecuteRuling: Doing nothing here...",[])
}

// Helper functions
function getPeriod(period: number): string {
  log.debug("getPeriod function: Asking period of number {}", [period.toString()])
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
    log.debug("getCurrentRulling: Asking current rulling in dispute {}", [disputeID.toString()])
    let contract = KlerosLiquid.bind(address)
    let callResult = contract.try_currentRuling(disputeID)
    let currentRulling = BigInt.fromI32(0)
    if (callResult.reverted) {
      log.debug("getCurrentRulling: currentRulling reverted", [])
    } else {
      currentRulling = callResult.value
    }
    return currentRulling
}

function getVoteCounter(disputeID: BigInt, round: BigInt, address: Address): BigInt {
  log.debug("getVoteCounter: Asking current rulling in the round {} of the dispute {}", [round.toString(), disputeID.toString()])
  let contract = KlerosLiquid.bind(address)
  let callResult = contract.try_getVoteCounter(disputeID, round)
  let winningChoice = BigInt.fromI32(0)
  if (callResult.reverted) {
    log.debug("getVoteCounter: reverted", [])
  } else {
    winningChoice = callResult.value.value0
  }
  return winningChoice
}

function getOrInitializeKlerosCounter(): KlerosCounter {
  let kc = KlerosCounter.load('ID')
  if (kc == null) {
    log.debug("getOrInitializeKlerosCounter: Initializing counters",[])
    kc = new KlerosCounter('ID')
    kc.courtsCount = BigInt.fromI32(0),
    kc.disputesCount = BigInt.fromI32(0),
    kc.openDisputes = BigInt.fromI32(0),
    kc.closedDisputes = BigInt.fromI32(0),
    kc.evidencePhaseDisputes = BigInt.fromI32(0),
    kc.votingPhaseDisputes = BigInt.fromI32(0),
    kc.appealPhaseDisputes = BigInt.fromI32(0),
    kc.activeJurors = BigInt.fromI32(0),
    kc.inactiveJurors = BigInt.fromI32(0),
    kc.drawnJurors = BigInt.fromI32(0)
    kc.tokenStaked = BigInt.fromI32(0)
    
    kc.save()
  } else{
    log.debug("getOrInitializeKlerosCounter: counters loaded",[])
  }
  return kc!
}

export function getOrCreateCourt(subcourtID: BigInt, KLContract: Address): Court {
  log.debug("getOrCreateCourt: Loading court {}",[subcourtID.toString()])
  let court = Court.load(subcourtID.toString())
  if (court == null){
    court = new Court(subcourtID.toString())
    log.debug("getOrCreateCourt: Creating court {}",[court.id])
    court.subcourtID = subcourtID
    court.childs = []
    court.disputesNum = BigInt.fromI32(0)
    court.disputesClosed = BigInt.fromI32(0)
    court.disputesOngoing = BigInt.fromI32(0)
    court.activeJurors = BigInt.fromI32(0)
    court.tokenStaked = BigInt.fromI32(0)
    // get courtInputs from contract
    log.debug("getOrCreateCourt: Asking to the contract the parameters",[])
    let contract = KlerosLiquid.bind(KLContract)
    let courtObj = contract.courts(subcourtID)
    court.hiddenVotes =  courtObj.value1
    court.minStake = courtObj.value2
    court.alpha = courtObj.value3
    court.feeForJuror = courtObj.value4
    court.jurorsForCourtJump = courtObj.value5
    // get timePeriods
    let subcourtObj = contract.getSubcourt(subcourtID)
    court.timePeriods = subcourtObj.value1
    
    let parentCourtID = courtObj.value0
    if (parentCourtID != subcourtID){
      let parentCourt = getOrCreateCourt(parentCourtID,KLContract)
      court.parent = parentCourt.id
      // updating childs in parent court
      let childs = parentCourt.childs
      childs.push(court.id)
      parentCourt.childs = childs
      parentCourt.save()
    }

    log.debug("getOrCreateCourt: Saving court",[])
    court.save() 

    // update courtCounter
    let kc = getOrInitializeKlerosCounter()
    kc.courtsCount = kc.courtsCount.plus(BigInt.fromI32(1))
    kc.save()
  }
  return court!
}


function getOrCreateCourtStake(courtID: BigInt, stake: BigInt, address: Address, timestamp:BigInt, blockNumber: BigInt, KLContract: Address): CourtStake {
  let id = address.toHexString()+"-"+courtID.toString()
  let courtStake = CourtStake.load(id)
  if (courtStake == null){
    log.debug("getOrCreateCourtStake: Creating a new CourtStake in the court {}",[courtID.toString()])
    courtStake = new CourtStake(id)
    courtStake.stake = stake
    let court = getOrCreateCourt(courtID, KLContract)
    courtStake.court = court.id
    courtStake.timestamp = timestamp
    courtStake.blockNumber = blockNumber
    let juror = getOrCreateJuror(address, courtID, BigInt.fromI32(0), KLContract)
    courtStake.juror = juror.id
    courtStake.save()
  }
  return courtStake!
}

function getOrCreateJuror(address: Address, courtID: BigInt | null, totalStake: BigInt, KLContract: Address): Juror {
  let id = address.toHexString()
  let juror = Juror.load(id)
  if (juror==null){
    log.debug("getOrCreateJuror: Creating a new juror with address",[])
    juror = new Juror(id)
    juror.numberOfDisputesCreated = BigInt.fromI32(0)
    juror.numberOfDisputesAsJuror = BigInt.fromI32(0)
    juror.totalStaked = totalStake
    juror.activeJuror = true
    if (courtID != null){
      let court = getOrCreateCourt(courtID!, KLContract)
      juror.subcourtsIDs = [court.id]
    }
    juror.save()
  }
  return juror!
}

function updateJurorStake(address: Address, courtID: BigInt,stake: BigInt, totalStaked: BigInt, timestamp: BigInt, blockNumber: BigInt, KLContract: Address): void{
  let courtStake = getOrCreateCourtStake(courtID, stake, address, timestamp, blockNumber, KLContract)
  // log.debug("updateJurorStake: updating court stake", [])
  let isNewJuror = courtStake.timestamp == timestamp
  let oldStake = courtStake.stake
  courtStake.stake = stake
  courtStake.timestamp = timestamp
  courtStake.blockNumber = blockNumber
  courtStake.save()
  // log.debug("updateJurorStake: updating juror total stake and if it's active", [])
  let juror = getOrCreateJuror(address, courtID, totalStaked, KLContract)
  juror.totalStaked = totalStaked
  if (totalStaked == BigInt.fromI32(0)){
    juror.activeJuror = false
  } else{
    juror.activeJuror = true
  }
  
  // update court Jurors stats
  // log.debug("updateJurorStake: updating court juror counter", [])
  let court = getOrCreateCourt(courtID, KLContract)
  let kc = getOrInitializeKlerosCounter()
  if (isNewJuror){
    // this juror is new in the court, because the oldstake it's actually the current stake (created CourtStake in the function)
    log.debug("updateJurorStake: {} is new juror staking first in court {}, updating juror count and total staked", [juror.id, court.id])
    court.activeJurors = court.activeJurors.plus(BigInt.fromI32(1))
    court.tokenStaked = court.tokenStaked.plus(stake)
    kc.activeJurors = kc.activeJurors.plus(BigInt.fromI32(1))
    court.save()
    kc.save()
  } else if (stake == BigInt.fromI32(0)) {
    // this juror is quiting from the court
    log.debug("updateJurorStake: juror {} leaving the court {}, updating juror count and total staked", [juror.id,court.id])
    court.activeJurors = court.activeJurors.minus(BigInt.fromI32(1))
    court.tokenStaked = court.tokenStaked.minus(oldStake)
    kc.activeJurors = kc.activeJurors.minus(BigInt.fromI32(1))
    kc.inactiveJurors = kc.inactiveJurors.plus(BigInt.fromI32(1))
    court.save()
    kc.save()
  } else {
    // the juror just modify it's stake but still being an active juror
    log.debug("updateJurorStake: juror {} changing it's stake in the court {}, updating total staked", [juror.id, court.id])
    court.tokenStaked = court.tokenStaked.plus(stake).minus(oldStake)
    court.save()
  }

  // update subcourts where Juror is
  let subcourtIDs = juror.subcourtsIDs
  if (subcourtIDs.indexOf(court.id) == -1){
    log.debug("updateJurorStake: new stake of {} in the court {}. Updating subcourts in the juror entity", [juror.id, court.id])
    subcourtIDs.push(court.id)
    juror.subcourtsIDs = subcourtIDs
  }

  // Save juror entity
  juror.save()

}