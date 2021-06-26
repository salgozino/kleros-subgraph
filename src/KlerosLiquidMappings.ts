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
  BigInt,
  Bytes
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
  let jurorStatus = checkJurorStatus(event.params._address, event.params._stake, event.params._newTotalStake, event.params._subcourtID)
  let entity = new StakeSet(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )

  let juror = getOrCreateJuror(event.params._address, event.params._subcourtID, event.params._newTotalStake, event.address)
  entity.address = juror.id
  entity.subcourtID = event.params._subcourtID
  entity.stake = event.params._stake
  entity.newTotalStake = event.params._newTotalStake
  entity.save()
  log.info("handleStakeSet: stake set stored",[])
  
  // update the juror entity and the courtStake
  updateJurorStake(event.params._address, event.params._subcourtID, event.params._stake, 
    event.params._newTotalStake, event.block.timestamp, event.block.number, event.transaction.hash,
    jurorStatus, event.address) 
}

export function handleDisputeCreation(event: DisputeCreationEvent): void {
  log.debug("handleDisputeCreation: Creating a new dispute with id {}", [event.params._disputeID.toString()])
  let entity = new Dispute(event.params._disputeID.toString())
  entity.disputeID = event.params._disputeID
  entity.arbitrable = event.params._arbitrable
  entity.txid = event.transaction.hash

  // log.debug("handleDisputeCreation: asking the dispute {} to the contract", [event.params._disputeID.toString()])
  let contract = KlerosLiquid.bind(event.address)
  let disputeData = contract.disputes(event.params._disputeID)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  // define creator
  let creator = getOrCreateJuror(event.transaction.from, null, BigInt.fromI32(0), event.address)
  entity.creator = creator.id
  // sum +1 in the counter of the disputes created by this user
  creator.numberOfDisputesCreated = creator.numberOfDisputesCreated.plus(BigInt.fromI32(1))
  creator.save()

  entity.subcourtID = court.id
  entity.numberOfChoices = disputeData.value2
  entity.lastPeriodChange = disputeData.value4
  entity.period = getPeriodString(disputeData.value3)
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
  // sum +1 in the court counter
  court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
  court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
  court.save()
  // Kleros Counters
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
  if (juror.numberOfDisputesAsJuror.equals(BigInt.fromI32(0))){
    let kc = getOrInitializeKlerosCounter()
    log.debug("handleDraw: First time the juror {} is in a dispute, updating the global counter",[juror.id])
    kc.drawnJurors = kc.drawnJurors.plus(BigInt.fromI32(1))
    kc.save()

    juror.numberOfDisputesAsJuror = BigInt.fromI32(1)
    juror.save()
  } 
  else {
    // check if the juror was drawn already in this dispute?
    // TODO! this is not working properly..
    let alreadyDrawn = false
    for (let i=0; i<voteID.toI32(); i++){
      let otherVote = Draw.load(disputeID.toString()+"-"+i.toString())
      if (otherVote.address == event.params._address){
        alreadyDrawn = true
      }
    }
    // if wasn't drawn, sum 1 in the counter
    if (!alreadyDrawn){
      juror.numberOfDisputesAsJuror = juror.numberOfDisputesAsJuror.plus(BigInt.fromI32(1))
      juror.save()
    }
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
  entity.newPeriod = getPeriodString(event.params._period)
  entity.disputeId = event.params._disputeID
  entity.save()

  // update the dispute period
  // log.debug("handleNewPeriod: Updating the dispute {} information", [disputeID.toString()])
  let dispute = Dispute.load(disputeID.toString())
  if (dispute == null){
    log.error("handleNewPeriod: Error trying to load the dispute with id {}. The new period will not be stored", [disputeID.toString()])
    return
  }
  dispute.period = getPeriodString(event.params._period)
  let kc = getOrInitializeKlerosCounter()
  if (event.params._period == 4) {
    // executing rulling
    dispute.ruled = true
    let court = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
    log.debug("handleNewPeriod: Period 4: updating disputes ongoing and closed in court {} entity", [court.id])
    court.disputesOngoing = court.disputesOngoing.minus(BigInt.fromI32(1))
    court.disputesClosed = court.disputesClosed.plus(BigInt.fromI32(1))
    court.save()
    // update counters
    log.debug("handleNewPeriod: Updating KC parameters in period 4. +1 for closed disputes, -1 for openDisputes and appealPhaseDisputes", [])
    kc.openDisputes = kc.openDisputes.minus(BigInt.fromI32(1))
    kc.closedDisputes = kc.closedDisputes.plus(BigInt.fromI32(1))
    kc.appealPhaseDisputes = kc.appealPhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  } else if (event.params._period==3){
    // moving to appeal phase
    log.debug("handleNewPeriod: Updating KC parameters in period 3. +1 for appealPhase, -1 for votingPhase", [])
    kc.appealPhaseDisputes = kc.appealPhaseDisputes.plus(BigInt.fromI32(1))
    kc.votingPhaseDisputes = kc.votingPhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  } else if (event.params._period==2){
    log.debug("handleNewPeriod: Updating KC parameters in period 2. +1 for votinPhase disputes, -1 for evidencePhase disputes", [])
    // moving to voting phase (from the evidence phase)
    kc.votingPhaseDisputes = kc.votingPhaseDisputes.plus(BigInt.fromI32(1))
    kc.evidencePhaseDisputes = kc.evidencePhaseDisputes.minus(BigInt.fromI32(1))
    kc.save()
  } else {
    log.error("handleNewPeriod: new period of 1 (commit)!, I'm doing nothing", [])
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
  // log.debug("handleAppealDecision: Dispute loaded with id {}",[dispute.id])
  
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
  
  let oldcourt = getOrCreateCourt(BigInt.fromString(dispute.subcourtID), event.address)
  let court = getOrCreateCourt(disputeData.value0, event.address)
  if (oldcourt != court){
    log.debug("handleAppealDecision: Court Jump! in dispute {}. oldCourt it's {} and New court it's {} ", [dispute.id,oldcourt.id,court.id])
    dispute.subcourtID = court.id
    dispute.save()
    // update oldcourt counters
    log.debug("handleAppealDecision: Decreasing disputes in the old court {}", [oldcourt.id])
    oldcourt.disputesOngoing = oldcourt.disputesOngoing.minus(BigInt.fromI32(1))
    oldcourt.disputesNum = oldcourt.disputesNum.minus(BigInt.fromI32(1))
    oldcourt.save()
    // update new court counters
    log.debug("handleAppealDecision: Increasing disputes in the new court after jump: {}", [court.id])
    court.disputesNum = court.disputesNum.plus(BigInt.fromI32(1))
    court.disputesOngoing = court.disputesOngoing.plus(BigInt.fromI32(1))
    court.save()
  }
  // Update KlerosCounters
  let kc = getOrInitializeKlerosCounter()
  log.debug("handleAppealDecision: Adding 1 in evidence phase disputes and -1 to appeal phase disputes in the KC",[])
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
function getPeriodString(period: number): string {
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
    kc.totalETHFees = BigInt.fromI32(0)
    kc.totalPNKredistributed = BigInt.fromI32(0)
    kc.totalUSDthroughContract = BigInt.fromI32(0)
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
    if (parentCourtID.notEqual(subcourtID)){
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

function getCourtStakeId(address: Address, courtID: BigInt): string {
  return address.toHexString()+"-"+courtID.toString();
}

function createOrUpdateCourtStake(courtID: BigInt, stake: BigInt, address: Address, timestamp:BigInt,
                             blockNumber: BigInt, txID:Bytes, KLContract: Address): CourtStake {
  let id = getCourtStakeId(address, courtID)
  let courtStake = CourtStake.load(id)

  if (courtStake == null){
    log.debug("createOrUpdateCourtStake: Creating a new CourtStake in the court {} for juror {}",[courtID.toString(), address.toHexString()])
    courtStake = new CourtStake(id)

    let court = getOrCreateCourt(courtID, KLContract)
    courtStake.court = court.id
    let juror = getOrCreateJuror(address, courtID, BigInt.fromI32(0), KLContract)
    courtStake.juror = juror.id
  }

  courtStake.stake = stake
  courtStake.timestamp = timestamp
  courtStake.blockNumber = blockNumber
  courtStake.txid = txID

  courtStake.save()

  return courtStake!
}

function getOrCreateJuror(address: Address, courtID: BigInt | null, totalStake: BigInt, KLContract: Address): Juror {
  let id = address.toHexString()
  let juror = Juror.load(id)
  if (juror==null){
    log.debug("getOrCreateJuror: Creating a new juror with address {}",[id])
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

function updateJurorStake(address: Address, courtID: BigInt,stake: BigInt, totalStaked: BigInt, 
  timestamp: BigInt, blockNumber: BigInt, txID:Bytes, 
  jurorStatus:number, KLContract: Address): void{
  log.debug("updateJurorStake: updating court stake for juror {} and court {}", [address.toHexString(), courtID.toString()])

  let juror = getOrCreateJuror(address, courtID, totalStaked, KLContract)
  let court = getOrCreateCourt(courtID, KLContract)

  let oldStake = getCourtStakeValue(courtID, address)

  createOrUpdateCourtStake(courtID, stake, address, timestamp, blockNumber, txID, KLContract)

  // update KlerosCounters 
  updateKCDueToStake(oldStake, stake, jurorStatus)
  // update court stats for jurors and token staked
  updateCourtDueToStake(courtID, oldStake, stake, jurorStatus, KLContract)
  
  // update juror entity
  juror.totalStaked = totalStaked
  let subcourtIDs = juror.subcourtsIDs
  if (subcourtIDs.indexOf(court.id) == -1){
    subcourtIDs.push(court.id)
  }    
  juror.subcourtsIDs = subcourtIDs
  if (totalStaked.equals(BigInt.fromI32(0))){
    juror.activeJuror = false
    log.debug("updateJurorStake: Saving {} as an inactive juror with {} pnk as total staked",[address.toHexString(), totalStaked.toString()])
  } else{
    juror.activeJuror = true
    log.debug("updateJurorStake: Saving {} as an active juror with {} pnk as total staked",[address.toHexString(), totalStaked.toString()])
  }
  juror.save()
}

function updateCourtDueToStake(courtID:BigInt, oldStake:BigInt, newStake:BigInt, jurorStatus:number, KLContract: Address): void{
  let court = getOrCreateCourt(courtID, KLContract)
  
  if (jurorStatus < 1){
    // juror quitting this court
    log.debug("updateCourtTokenStaked: Removing the juror from court {}. OldStake {}, NewStake {}",[court.id, oldStake.toString(), newStake.toString()])
    court.activeJurors = court.activeJurors.minus(BigInt.fromI32(1))
  } else if (jurorStatus > 1){
    log.debug("updateCourtTokenStaked: Adding the new juror to court {}. OldStake {}, NewStake {}",[court.id, oldStake.toString(), newStake.toString()])
    court.activeJurors = court.activeJurors.plus(BigInt.fromI32(1))
    if (oldStake.notEqual(BigInt.fromI32(0))){
      log.error("updateCourtTokenStaked: oldStake should be zero for a new juror or old inactive juror staking again!. OldStake {}, NewStake {}",[court.id, oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    } 
  } else{
    log.debug("updateCourtTokenStaked: Just changes in the tokenStaked for court {}. OldStake {}, NewStake {}",[court.id, oldStake.toString(), newStake.toString()])
  }
  court.tokenStaked = court.tokenStaked.minus(oldStake).plus(newStake)
  court.save()

  // if this court has a parent, update the tokenStaked and counters in the parent court too.
  if (court.parent != null){
    updateCourtDueToStake(BigInt.fromString(court.parent), oldStake, newStake, jurorStatus, KLContract)
  }
}

function checkJurorStatus(address:Address, stake:BigInt, newTotalStaked:BigInt, court:BigInt): number {
  // -1 = quitting from all the courts
  // 0 = quitting just from this court (but still active in other courts)
  // 1 = changing stake in this court, still an active juror (or inactive juror)
  // 2 = old inactive juror staking again in a court
  // 3 = active juror staking for the first time in a this court
  // 4 = very first time juror.
  let juror = Juror.load(address.toHexString())
  let isActive = isActiveInThisCourt(court, address)
  
  if (juror == null){
    // This juror doesn't exist, it's a new juror staking
    log.debug("checkJurorStatus: Say hi to {} who is a new juror",[address.toHexString()])
    return 4!
  }
  // the juror exist
  let isActiveGlobally = juror.activeJuror // BEfore this stake it's stored.
  if (isActive){
    if (stake.gt(BigInt.fromI32(0)) && newTotalStaked.gt(BigInt.fromI32(0))){
      // active juror in this court changing it's stake in this court.
      log.debug("checkJurorStatus: {} is an active juror changing his stake in the court!. Total Staked {}, stake {}",[address.toHexString(), juror.totalStaked.toString(), stake.toString()])
      return 1!
    } else if (stake.equals(BigInt.fromI32(0)) && newTotalStaked.gt(BigInt.fromI32(0))){
      // active juror of this court, leaving just this court
      
      return 0!
    } else if (stake.equals(BigInt.fromI32(0)) && newTotalStaked.equals(BigInt.fromI32(0))){
      // active juror leaving all the courts
      log.debug("checkJurorStatus: {} is an active juror quitting from all the courts!. old Total Staked {}, new Total Staked {}, stake {}",[address.toHexString(), juror.totalStaked.toString(),newTotalStaked.toString(), stake.toString()])
      return -1!
    } else{
      log.error("checkJurorStatus: Reaching an imposible condition¿?. stake = {}, newTotalStaked = {}", [
        stake.toString(), newTotalStaked.toString()])
    }
  } else{
    // not an active juror in this court.
    if (isActiveGlobally){
      // Active juror in other court, but not in this court.
      if (stake.gt(BigInt.fromI32(0))){
        // this juror is staking for the first time in this court.
        log.debug("checkJurorStatus: {} is an active juror but first time in this court!. Total Staked {}, stake {}",[address.toHexString(), juror.totalStaked.toString(), stake.toString()])
        return 3!
      }
    } else {
      if (stake.gt(BigInt.fromI32(0))){
        // inactive juror staking
        log.debug("checkJurorStatus: Hey, {} is a juror returning to the courts!. old Total Staked {}, new Total Staked {}, stake {}",[address.toHexString(), juror.totalStaked.toString(), newTotalStaked.toString(), stake.toString()])
        return 2!
      } else {
        // inactive juror unstaking (double txs?)
        log.debug("checkJurorStatus: Mmmm, this is an inactive juror staking 0? The juror {} is sending the tx twice?. Returning status as 1 (not change active/inactive jurors",[juror.id])
        return 1!
      }
    }
  }
  log.error("checkJurorStatus: Mmmm, This should never be met, what's doing the juror {} with stake {}?. TotalStaked {}. Returning 1",[juror.id, stake.toString(), juror.totalStaked.toString()])
  return 1!
}

function getCourtStakeValue(court:BigInt, address:Address): BigInt {
  let courtStake = CourtStake.load(getCourtStakeId(address, court))

  if (courtStake == null) {
    return BigInt.fromI32(0)
  }

  return courtStake.stake
}

function isActiveInThisCourt(court:BigInt, address:Address): boolean {
  return getCourtStakeValue(court, address).gt(BigInt.fromI32(0))
}

function updateKCDueToStake(oldStake:BigInt, newStake:BigInt, jurorStatus:number): void{
  // update global counters for tokenStaked and active jurors
  let kc = getOrInitializeKlerosCounter()
  if (jurorStatus === 4){
    // newJuror
    log.debug("updateKCDueToStake: updating KC with a new Juror!. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
    kc.activeJurors = kc.activeJurors.plus(BigInt.fromI32(1))
    if (oldStake.notEqual(BigInt.fromI32(0))){
      log.warning("updateKCDueToStake: it's a new juror, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 3){
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is an active juror staking for the first time in a court. Stake {} to {}", [oldStake.toString(), newStake.toString()])
    if (oldStake.notEqual(BigInt.fromI32(0))){
      log.warning("updateKCDueToStake: it's their first time in a court, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 2){
    // old juror staking again
    log.debug("updateKCDueToStake: updating KC with an old inactive juror now as active!. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
    kc.activeJurors = kc.activeJurors.plus(BigInt.fromI32(1))
    kc.inactiveJurors = kc.inactiveJurors.minus(BigInt.fromI32(1))
    if (oldStake.notEqual(BigInt.fromI32(0))){
      log.warning("updateKCDueToStake: it's an old inactive juror, oldStake should be zero. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
      oldStake = BigInt.fromI32(0)
    }
  } else if (jurorStatus === 1){
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is just changing their stake from {} to {}", [oldStake.toString(), newStake.toString()])
  } else if (jurorStatus === 0){
    log.debug("updateKCDueToStake: KC juror counts doesn't need to be changed, just the tokenStaked, This juror is just quitting from one court. Stake from {} to {}", [oldStake.toString(), newStake.toString()])
  } else if(jurorStatus === -1){
    // An active juror quiting from all the courts
    kc.activeJurors = kc.activeJurors.minus(BigInt.fromI32(1))
    kc.inactiveJurors = kc.inactiveJurors.plus(BigInt.fromI32(1))
    log.debug("updateKCDueToStake: updating KC with an active juror quitting from all the courts. OldStake {} and NewStake {}", [oldStake.toString(), newStake.toString()])
  } 
  kc.tokenStaked = kc.tokenStaked.plus(newStake).minus(oldStake)
  kc.save()
}