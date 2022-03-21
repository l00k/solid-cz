import {
    LendingProtocol,
    LiquidatedDepositEvent,
    LiquidationIncentiveChangedEvent,
    LoanFullyRepaidEvent,
    LoanPartiallyRepaidEvent, TransferToTresouryEvent
} from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { SwapProviderMock } from '@/SwapProviderMock';
import { TokenMock } from '@/TokenMock';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { main } from 'ts-node/dist/bin';
import {
    assertEvent,
    assertIsAvailableOnlyForOwner, assertNoEvent,
    createTokenMock,
    deployContract,
    executeInSingleBlock,
    txExec, waitForTxs
} from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Liquidations component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    
    let smplToken1 : TokenMock;
    let smplToken2 : TokenMock;
    let smplToken3 : TokenMock;
    
    let priceFeedContract1 : PriceFeedMock;
    let priceFeedContract2 : PriceFeedMock;
    let priceFeedContract3 : PriceFeedMock;
    
    let swapProviderMock : SwapProviderMock;
    
    
    function deposit (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>[]
    {
        return [
            // approve amount before depositing
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                ),
            
            // deposit
            mainContract
                .connect(account)
                .deposit(
                    tokenContract.address,
                    amount
                ),
        ];
    }
    
    function repay (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>[]
    {
        return [
            // approve amount before repaying
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                ),
            // repay
            mainContract
                .connect(account)
                .repay(
                    tokenContract.address,
                    amount
                ),
        ];
    }
    
    async function pushNewPriceIntoFeed (
        priceFeedContract : PriceFeedMock,
        price : BigNumber
    ) : Promise<ContractTransaction>
    {
        return priceFeedContract
            .pushRoundData({
                answer: price,
                roundId: 0,
                answeredInRound: 0,
                startedAt: 0,
                updatedAt: 0,
            });
    }
    
    async function setupToken (
        name : string,
        symbol : string,
        initialPrice : BigNumber,
        collateralFactor : number = 5e7,
        borrowableFraction : number = 5e7
    ) : Promise<[ TokenMock, PriceFeedMock ]>
    {
        const token : TokenMock = await createTokenMock(name, symbol);
        const priceFeedContract : PriceFeedMock = await deployContract('PriceFeedMock');
        
        await executeInSingleBlock(async() => [
            priceFeedContract.setDecimals(8),
            pushNewPriceIntoFeed(priceFeedContract, initialPrice),
            mainContract.connect(owner).addSupportedAsset(token.address, priceFeedContract.address),
            mainContract.connect(owner).setTokenCollateralFactor(token.address, collateralFactor)
        ]);
        
        return [
            token,
            priceFeedContract
        ];
    }
    
    function checkLiquidatingDoesNothing ()
    {
        it('liquidating should do nothing', async() => {
            {
                const [ tx, result ] = await txExec(
                    mainContract
                        .connect(owner)
                        .liquidate(alice.address)
                );
                expect(result.events.length).to.be.equal(0);
            }
            
            {
                const tx = () => mainContract
                    .connect(owner)
                    .liquidate(alice.address);
                await expect(tx).to.changeTokenBalances(
                    smplToken1,
                    [ alice, mainContract ],
                    [ 0, 0 ]
                );
            }
            
            {
                const tx = () => mainContract
                    .connect(owner)
                    .liquidate(alice.address);
                await expect(tx).to.changeTokenBalances(
                    smplToken2,
                    [ alice, mainContract ],
                    [ 0, 0 ]
                );
            }
            
            {
                const prevState = await mainContract.getAccountCollateralization(alice.address);
                await txExec(
                    mainContract
                        .connect(owner)
                        .liquidate(alice.address)
                );
                expect(
                    await mainContract.getAccountCollateralization(alice.address)
                ).to.be.equal(prevState);
            }
        });
    }
    
    
    before(async() => {
        [ owner, alice, bob, carol ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create price feed
        [ smplToken1, priceFeedContract1 ] = await setupToken(
            'Sample1',
            'SMPL1',
            ethers.utils.parseUnits('25', 8)
        );
        
        [ smplToken2, priceFeedContract2 ] = await setupToken(
            'Sample2',
            'SMPL2',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken3, priceFeedContract3 ] = await setupToken(
            'Sample3',
            'SMPL3',
            ethers.utils.parseUnits('10', 8)
        );
        
        // provide liquidity
        await executeInSingleBlock(async() => [
            ...deposit(bob, smplToken1, ethers.utils.parseUnits('1000', 18)),
            ...deposit(carol, smplToken2, ethers.utils.parseUnits('1000', 18)),
            ...deposit(carol, smplToken3, ethers.utils.parseUnits('1000', 18)),
        ]);
        
        // swap provider
        swapProviderMock = await deployContract('SwapProviderMock');
        await txExec(
            mainContract.setSwapProvider(swapProviderMock.address)
        );
        
        await executeInSingleBlock(async() => [
            smplToken1.connect(owner).transfer(swapProviderMock.address, ethers.utils.parseUnits('100000', 18)),
            smplToken2.connect(owner).transfer(swapProviderMock.address, ethers.utils.parseUnits('100000', 18)),
            smplToken3.connect(owner).transfer(swapProviderMock.address, ethers.utils.parseUnits('100000', 18)),
        ]);
    });
    
    
    describe('Initial state', () => {
        it('Should return proper liquidation incentive', async() => {
            expect(
                await mainContract.getLiquidationIncentive()
            ).to.be.equal(0);
        });
        
        it('Should return proper collateralization value', async() => {
            expect(
                await mainContract.getAccountCollateralization(alice.address)
            ).to.be.equal(0);
        });
        
        checkLiquidatingDoesNothing();
    });
    
    
    describe('Changing liquidation incentive', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setLiquidationIncentive(1e7);
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setLiquidationIncentive(1e7)
            );
            
            await assertEvent<LiquidationIncentiveChangedEvent>(result, 'LiquidationIncentiveChanged', {
                fraction: BigNumber.from(1e7),
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setLiquidationIncentive(1e7)
                );
            });
            
            it('Should update state', async() => {
                expect(
                    await mainContract.getLiquidationIncentive()
                ).to.be.equal(1e7);
            });
        });
    });
    
    
    describe('with liquidation incentive configured', () => {
        beforeEach(async() => {
            await txExec(
                mainContract
                    .connect(owner)
                    .setLiquidationIncentive(1e7)
            );
        });
        
        // with liquidation incentive configured
        //      prices      (10, 25, 10, 10)
        describe('with assets deposited by Alice', () => {
            beforeEach(async() => {
                await executeInSingleBlock(async() => [
                    ...deposit(
                        alice,
                        smplToken1,
                        ethers.utils.parseUnits('40', 18)
                    ),
                    ...deposit(
                        alice,
                        smplToken2,
                        ethers.utils.parseUnits('50', 18)
                    ),
                    ...deposit(
                        alice,
                        smplToken3,
                        ethers.utils.parseUnits('50', 18)
                    ),
                ]);
            });
            
            
            it('Should return proper collateralization value', async() => {
                const collateralization = await mainContract.getAccountCollateralization(alice.address);
                // (40 * 25 * 0.5) + (50 * 10 * 0.5) + (50 * 10 * 0.5)
                expect(collateralization).to.be.equal(ethers.utils.parseUnits('1000', 8));
            });
            
            checkLiquidatingDoesNothing();
            
            
            // with liquidation incentive configured
            // with assets deposited by Alice
            //      prices      (10, 25, 10, 10)
            //      deposit     (0, 40, 50, 50)
            //      collateralisation   1000
            describe('with BBB borrowed by Alice', () => {
                beforeEach(async() => {
                    await txExec(
                        mainContract
                            .connect(alice)
                            .borrow(
                                smplToken2.address,
                                ethers.utils.parseUnits('30', 18)
                            )
                    );
                });
                
                it('Should return proper collateralization value', async() => {
                    const collateralization = await mainContract.getAccountCollateralization(alice.address);
                    // 1000 - [30 * 10 * (1 + 0.1)]
                    expect(collateralization).to.be.equal(ethers.utils.parseUnits('670', 8));
                });

                checkLiquidatingDoesNothing();
                
                
                // with liquidation incentive configured
                // with assets deposited by Alice
                // with BBB borrowed by Alice
                //      prices      (10, 25, 10, 10)
                //      deposit     (0, 40, 50, 50)
                //      debit       (0, 0, 30, 0)
                //      collateralisation   670
                describe('with deposited assets price drop (enough deposit to cover debit)', () => {
                    beforeEach(async() => {
                        await executeInSingleBlock(async() => [
                            pushNewPriceIntoFeed(priceFeedContract1, ethers.utils.parseUnits('1', 8)),
                            pushNewPriceIntoFeed(priceFeedContract3, ethers.utils.parseUnits('1', 8)),
                            swapProviderMock.setSwapPrice(smplToken1.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                            swapProviderMock.setSwapPrice(smplToken3.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                        ]);
                    });
                    
                    it('Should return proper collateralization value', async() => {
                        const collateralization = await mainContract.getAccountCollateralization(alice.address);
                        // [(40 * 1 * 0.5) + (50 * 10 * 0.5) + (50 * 1 * 0.5)] - (30 * 10 * 1.1)
                        expect(collateralization).to.be.equal(ethers.utils.parseUnits('-35', 8));
                    });
                    
                    
                    // with liquidation incentive configured
                    // with assets deposited by Alice
                    // with BBB borrowed by Alice
                    // with deposited assets price drop (enough deposit to cover debit)
                    describe('liquidating', () => {
                        let tx : ContractTransaction;
                        let result : ContractReceipt;
                        
                        beforeEach(async() => {
                            [ tx, result ] = await txExec(
                                mainContract
                                    .connect(owner)
                                    .liquidate(alice.address)
                            );
                        });
                        
                        it('Should emit LiquidatedDeposit events', async() => {
                            // (30 * 10 * 1.1) / 1 = 330 (max 40)
                            await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                who: alice.address,
                                token: smplToken1.address,
                                amount: ethers.utils.parseUnits('40', 18),
                            });
                            
                            // [(30 * 10 * 1.1) - (40 * 1)] / 10 = 29 (max 50)
                            await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('29', 18).sub(1),
                            }, 1);
                        });
                        
                        it('Should emit LoanPartiallyRepaid events', async() => {
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                // (40 / 10) / 1.1
                                amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).add(1),
                            });
                            
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                // (29 / 1) / 1.1
                                amount: ethers.utils.parseUnits('29', 18).mul(10).div(11),
                            }, 1);
                        });
                        
                        it('Should emit LoanFullyRepaid event', async() => {
                            await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                            });
                        });
                        
                        it('Should emit TransferToTresoury event', async() => {
                            await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).div(10)
                            });
                            
                            await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('29', 18).mul(10).div(11).div(10),
                            }, 1);
                        });
                        
                        it('Should reduce deposit', async() => {
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken1.address, alice.address)
                            ).to.be.equal(0);
                            
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                            ).to.be.equal(ethers.utils.parseUnits('21', 18).add(1));
                            
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address)
                            ).to.be.equal(ethers.utils.parseUnits('50', 18));
                        });
                        
                        it('Should return proper collateralization value', async() => {
                            const collateralization = await mainContract.getAccountCollateralization(alice.address);
                            // [(21 * 10 * 0.5) + (50 * 1 * 0.5)]
                            expect(collateralization).to.be.equal(ethers.utils.parseUnits('130', 8));
                        });
                        
                        it('Should increase tresoury with liquidation bonus', async() => {
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                            ).to.be.equal(ethers.utils.parseUnits('33', 18).div(11).sub(1));
                        });
                    });
                    
                    
                    
                    // with liquidation incentive configured
                    // with assets deposited by Alice
                    // with BBB borrowed by Alice
                    // with deposited assets price drop (enough deposit to cover debit)
                    describe('with reduced token liquidity', () => {
                        beforeEach(async() => {
                            await txExec(
                                mainContract
                                    .__test__burnBalance(
                                        smplToken1.address,
                                        ethers.utils.parseUnits('1020', 18)
                                    )
                            );
                        });
                    
                        describe('liquidating', () => {
                            let tx : ContractTransaction;
                            let result : ContractReceipt;
                            
                            beforeEach(async() => {
                                [ tx, result ] = await txExec(
                                    mainContract
                                        .connect(owner)
                                        .liquidate(alice.address)
                                );
                            });
                            
                        
                            it('Should emit LiquidatedDeposit events', async() => {
                                // (30 * 10 * 1.1) / 1 = 330 (max 20 - reduced liqudity)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken1.address,
                                    amount: ethers.utils.parseUnits('20', 18),
                                });
                                
                                // [(30 * 10 * 1.1) - (20 * 1)] / 10 = 31 (max 50)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('31', 18).sub(1),
                                }, 1);
                            });
                            
                            it('Should emit LoanPartiallyRepaid events', async() => {
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (20 / 10) / 1.1
                                    amount: ethers.utils.parseUnits('2', 18).mul(10).div(11).add(1),
                                });
                                
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (31 / 1) / 1.1
                                    amount: ethers.utils.parseUnits('31', 18).mul(10).div(11),
                                }, 1);
                            });
                            
                            it('Should emit LoanFullyRepaid event', async() => {
                                await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                });
                            });
                            
                            it('Should emit TransferToTresoury event', async() => {
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('2', 18).mul(10).div(11).div(10)
                                });
                                
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('31', 18).mul(10).div(11).div(10),
                                }, 1);
                            });
                            
                            it('Should reduce deposit', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken1.address, alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('20', 18));
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('19', 18).add(1));
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('50', 18));
                            });
                            
                            it('Should return proper collateralization value', async() => {
                                const collateralization = await mainContract.getAccountCollateralization(alice.address);
                                // [(20 * 1 * 0.5) + (19 * 10 * 0.5) + (50 * 1 * 0.5)]
                                expect(collateralization).to.be.equal(ethers.utils.parseUnits('130', 8));
                            });
                            
                            it('Should increase tresoury with liquidation bonus', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                                ).to.be.equal(ethers.utils.parseUnits('33', 18).div(11).sub(1));
                            });
                        });
                    });
                });
                
                
                // with liquidation incentive configured
                // with assets deposited by Alice
                // with BBB borrowed by Alice
                //      prices      (10, 25, 10, 10)
                //      deposit     (0, 40, 50, 50)
                //      debit       (0, 0, 30, 0)
                //      collateralisation   670
                describe('with deposited assets price drop (not enough deposit to cover debit)', () => {
                    beforeEach(async() => {
                        // first withdraw deposit
                        await txExec(
                            mainContract
                                .connect(alice)
                                .withdraw(
                                    smplToken2.address,
                                    ethers.utils.parseUnits('49', 18)
                                )
                        );
                        
                        await executeInSingleBlock(async() => [
                            pushNewPriceIntoFeed(priceFeedContract1, ethers.utils.parseUnits('1', 8)),
                            pushNewPriceIntoFeed(priceFeedContract3, ethers.utils.parseUnits('1', 8)),
                            swapProviderMock.setSwapPrice(smplToken1.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                            swapProviderMock.setSwapPrice(smplToken3.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                        ]);
                    });
                    
                    it('Should return proper collateralization value', async() => {
                        const collateralization = await mainContract.getAccountCollateralization(alice.address);
                        // [(40 * 1 * 0.5) + (1 * 10 * 0.5) + (50 * 1 * 0.5)] - (30 * 10 * 1.1)
                        expect(collateralization).to.be.equal(ethers.utils.parseUnits('-280', 8));
                    });
                    
                    
                    // with liquidation incentive configured
                    // with assets deposited by Alice
                    // with BBB borrowed by Alice
                    // with deposited assets price drop (not enough deposit to cover debit)
                    describe('liquidating', () => {
                        let tx : ContractTransaction;
                        let result : ContractReceipt;
                        
                        beforeEach(async() => {
                            [ tx, result ] = await txExec(
                                mainContract
                                    .connect(owner)
                                    .liquidate(alice.address)
                            );
                        });
                        
                        it('Should emit LiquidatedDeposit events', async() => {
                            // 330 / 1 = 330 (max 40)
                            await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                who: alice.address,
                                token: smplToken1.address,
                                amount: ethers.utils.parseUnits('40', 18),
                            });
                            
                            // [330 - (40 * 1)] / 10 = 29 (max 1)
                            await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('1', 18),
                            }, 1);
                            
                            // [330 - (40 * 1) - (1 * 10)] / 1 = 280 (max 50)
                            await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                who: alice.address,
                                token: smplToken3.address,
                                amount: ethers.utils.parseUnits('50', 18),
                            }, 2);
                        });
                        
                        it('Should emit LoanPartiallyRepaid events', async() => {
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                // (40 / 10) / 1.1
                                amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).add(1),
                            });
                            
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                // (1 / 1) / 1.1
                                amount: ethers.utils.parseUnits('1', 18).mul(10).div(11).add(1),
                            }, 1);
                            
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                // (50 / 10) / 1.1
                                amount: ethers.utils.parseUnits('5', 18).mul(10).div(11).add(1),
                            }, 2);
                        });
                        
                        it('Should not emit LoanFullyRepaid event', async() => {
                            await assertNoEvent(result, 'LoanFullyRepaid');
                        });
                        
                        it('Should emit TransferToTresoury event', async() => {
                            await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).div(10)
                            });
                            
                            await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('1', 18).mul(10).div(11).div(10),
                            }, 1);
                            
                            await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('5', 18).mul(10).div(11).div(10),
                            }, 2);
                        });
                        
                        it('Should reduce deposit', async() => {
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken1.address, alice.address)
                            ).to.be.equal(0);
                            
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                            ).to.be.equal(0);
                            
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address)
                            ).to.be.equal(0);
                        });
                        
                        it('Should return proper collateralization value', async() => {
                            const collateralization = await mainContract.getAccountCollateralization(alice.address);
                            // [0 - (30 - 10 / 1.1) * 1.1]
                            expect(collateralization).to.be.equal(ethers.utils.parseUnits('-230', 8).add(1));
                        });
                        
                        it('Should increase tresoury with liquidation bonus', async() => {
                            expect(
                                await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                            ).to.be.equal(ethers.utils.parseUnits('10', 18).div(11));
                        });
                    });
                });
                
                
                // with liquidation incentive configured
                // with assets deposited by Alice
                // with BBB borrowed by Alice
                //      prices      (10, 25, 10, 10)
                //      deposit     (0, 40, 50, 50)
                //      debit       (0, 0, 30, 0)
                //      collateralisation   670
                describe('with BBB price increase', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract2,
                            ethers.utils.parseUnits('100', 8)
                        );
                    });
                    
                    it('Should return proper collateralization value', async() => {
                        const collateralization = await mainContract.getAccountCollateralization(alice.address);
                        // [(40 * 25 * 0.5) + (50 * 100 * 0.5) + (50 * 10 * 0.5)] - (30 * 100 * 1.1)
                        expect(collateralization).to.be.equal(ethers.utils.parseUnits('-50', 8));
                    });
                });
                
                
                // with liquidation incentive configured
                // with assets deposited by Alice
                // with BBB borrowed by Alice
                //      prices      (10, 25, 10, 10)
                //      deposit     (0, 40, 50, 50)
                //      debit       (0, 0, 30, 0)
                //      collateralisation   670
                describe('with CCC borrowed by Alice', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .borrow(
                                    smplToken3.address,
                                    ethers.utils.parseUnits('20', 18)
                                )
                        );
                    });
                    
                    it('Should return proper collateralization value', async() => {
                        const collateralization = await mainContract.getAccountCollateralization(alice.address);
                        // 1000 - [ 30 * 10 + 20 * 10 ] * 1.1
                        expect(collateralization).to.be.equal(ethers.utils.parseUnits('450', 8));
                    });
                    
                    checkLiquidatingDoesNothing();
                    
                    
                    // with liquidation incentive configured
                    // with assets deposited by Alice
                    // with BBB borrowed by Alice
                    // with CCC borrowed by Alice
                    //      prices      (10, 25, 10, 10)
                    //      deposit     (0, 40, 50, 30)
                    //      debit       (0, 0, 30, 20)
                    //      collateralisation   670
                    describe('with deposited assets price drop (enough deposit to cover debit)', () => {
                        beforeEach(async() => {
                            await executeInSingleBlock(async() => [
                                pushNewPriceIntoFeed(priceFeedContract1, ethers.utils.parseUnits('1', 8)),
                                pushNewPriceIntoFeed(priceFeedContract3, ethers.utils.parseUnits('1', 8)),
                                swapProviderMock.setSwapPrice(smplToken1.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                                swapProviderMock.setSwapPrice(smplToken3.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                                swapProviderMock.setSwapPrice(smplToken1.address, smplToken3.address, ethers.utils.parseUnits('1', 8)),
                                swapProviderMock.setSwapPrice(smplToken2.address, smplToken3.address, ethers.utils.parseUnits('10', 8)),
                            ]);
                        });
                        
                        it('Should return proper collateralization value', async() => {
                            const collateralization = await mainContract.getAccountCollateralization(alice.address);
                            // [(40 * 1 * 0.5) + (50 * 10 * 0.5) + (50 * 1 * 0.5)] - [(30 * 10) * 1.1 + (20 * 1) * 1.1]
                            expect(collateralization).to.be.equal(ethers.utils.parseUnits('-57', 8));
                        });
                        
                        
                        // with liquidation incentive configured
                        // with assets deposited by Alice
                        // with BBB borrowed by Alice
                        // with CCC borrowed by Alice
                        // with deposited assets price drop (enough deposit to cover debit)
                        describe('liquidating', () => {
                            let tx : ContractTransaction;
                            let result : ContractReceipt;
                            
                            beforeEach(async() => {
                                [ tx, result ] = await txExec(
                                    mainContract
                                        .connect(owner)
                                        .liquidate(alice.address)
                                );
                            });
                            
                            // liquidationValueBBB = (30 * 10 * 1.1) = 330
                            // liquidationValueCCC = (20 * 1 * 1.1) = 22
                            
                            it('Should emit LiquidatedDeposit events', async() => {
                                // 330 / 1 = 385 (max 40)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken1.address,
                                    amount: ethers.utils.parseUnits('40', 18),
                                });
                                
                                // [330 - (40 * 1)] / 10 = 34.5 (max 50)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('29', 18).sub(1),
                                }, 1);
                                
                                // 22 / 10 = 2.2 (max 15.5)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('2.2', 18),
                                }, 2);
                            });
                            
                            it('Should emit LoanPartiallyRepaid events', async() => {
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (40 / 10) / 1.1
                                    amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).add(1),
                                });
                                
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (29 / 1) / 1.1
                                    amount: ethers.utils.parseUnits('29', 18).mul(10).div(11),
                                }, 1);
                                
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken3.address,
                                    amount: ethers.utils.parseUnits('20', 18),
                                }, 2);
                            });
                            
                            it('Should emit LoanFullyRepaid event', async() => {
                                await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                });
                                await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                    who: alice.address,
                                    token: smplToken3.address,
                                }, 1);
                            });
                            
                            it('Should emit TransferToTresoury event', async() => {
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).div(10)
                                });
                                
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('29', 18).mul(10).div(11).div(10),
                                }, 1);
                                
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken3.address,
                                    amount: ethers.utils.parseUnits('22', 18).mul(10).div(11).div(10),
                                }, 2);
                            });
                            
                            it('Should reduce deposit', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken1.address, alice.address)
                                ).to.be.equal(0);
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('18.8', 18).add(1));
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address)
                                ).to.be.equal(ethers.utils.parseUnits('50', 18));
                            });
                            
                            it('Should return proper collateralization value', async() => {
                                const collateralization = await mainContract.getAccountCollateralization(alice.address);
                                // [(18.8 * 10 * 0.5) + (50 * 1 * 0.5)]
                                expect(collateralization).to.be.equal(ethers.utils.parseUnits('119', 8));
                            });
                            
                            it('Should increase tresoury with liquidation bonus', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                                ).to.be.equal(ethers.utils.parseUnits('33', 18).div(11).sub(1));
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken3.address, mainContract.address)
                                ).to.be.equal(ethers.utils.parseUnits('22', 18).div(11));
                            });
                        });
                    });
                    
                    
                    // with liquidation incentive configured
                    // with assets deposited by Alice
                    // with BBB borrowed by Alice
                    // with CCC borrowed by Alice
                    //      prices      (10, 25, 10, 10)
                    //      deposit     (0, 40, 50, 50)
                    //      debit       (0, 0, 30, 20)
                    //      collateralisation   670
                    describe('with deposited assets price drop (not enough deposit to cover debit)', () => {
                        beforeEach(async() => {
                            // first withdraw deposit
                            await txExec(
                                mainContract
                                    .connect(alice)
                                    .withdraw(
                                        smplToken2.address,
                                        ethers.utils.parseUnits('49', 18)
                                    )
                            );
                            
                            await executeInSingleBlock(async() => [
                                pushNewPriceIntoFeed(priceFeedContract1, ethers.utils.parseUnits('1', 8)),
                                pushNewPriceIntoFeed(priceFeedContract3, ethers.utils.parseUnits('1', 8)),
                                swapProviderMock.setSwapPrice(smplToken1.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                                swapProviderMock.setSwapPrice(smplToken3.address, smplToken2.address, ethers.utils.parseUnits('0.1', 8)),
                                swapProviderMock.setSwapPrice(smplToken1.address, smplToken3.address, ethers.utils.parseUnits('1', 8)),
                                swapProviderMock.setSwapPrice(smplToken2.address, smplToken3.address, ethers.utils.parseUnits('10', 8)),
                            ]);
                        });
                        
                        it('Should return proper collateralization value', async() => {
                            const collateralization = await mainContract.getAccountCollateralization(alice.address);
                            // [(40 * 1 * 0.5) + (1 * 10 * 0.5) + (50 * 1 * 0.5)] - [(30 * 10) * 1.1 + (20 * 1) * 1.1]
                            expect(collateralization).to.be.equal(ethers.utils.parseUnits('-302', 8));
                        });
                        
                        
                        // with liquidation incentive configured
                        // with assets deposited by Alice
                        // with BBB borrowed by Alice
                        // with CCC borrowed by Alice
                        // with deposited assets price drop (not enough deposit to cover debit)
                        describe('liquidating', () => {
                            let tx : ContractTransaction;
                            let result : ContractReceipt;
                            
                            beforeEach(async() => {
                                [ tx, result ] = await txExec(
                                    mainContract
                                        .connect(owner)
                                        .liquidate(alice.address)
                                );
                            });
                            
                            // liquidationValueBBB = (30 * 10 * 1.1) = 330
                            // liquidationValueCCC = (20 * 1 * 1.1) = 22
                            
                            it('Should emit LiquidatedDeposit events', async() => {
                                // 330 / 1 = 385 (max 40)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken1.address,
                                    amount: ethers.utils.parseUnits('40', 18),
                                });
                                
                                // [330 - (40 * 1)] / 10 = 29 (max 1)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('1', 18),
                                }, 1);
                                
                                // [330 - (40 * 1) - (1 * 10)] / 1 = 280 (max 50)
                                await assertEvent<LiquidatedDepositEvent>(result, 'LiquidatedDeposit', {
                                    who: alice.address,
                                    token: smplToken3.address,
                                    amount: ethers.utils.parseUnits('50', 18),
                                }, 2);
                            });
                            
                            it('Should emit LoanPartiallyRepaid events', async() => {
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (40 / 10) / 1.1
                                    amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).add(1),
                                });
                                
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (1 / 1) / 1.1
                                    amount: ethers.utils.parseUnits('1', 18).mul(10).div(11).add(1),
                                }, 1);
                                
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    // (50 / 10) / 1.1
                                    amount: ethers.utils.parseUnits('5', 18).mul(10).div(11).add(1),
                                }, 2);
                            });
                        
                            it('Should not emit LoanFullyRepaid event', async() => {
                                await assertNoEvent(result, 'LoanFullyRepaid');
                            });
                            
                            it('Should emit TransferToTresoury event', async() => {
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('4', 18).mul(10).div(11).div(10)
                                });
                                
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('1', 18).mul(10).div(11).div(10),
                                }, 1);
                                
                                await assertEvent<TransferToTresouryEvent>(result, 'TransferToTresoury', {
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('5', 18).mul(10).div(11).div(10),
                                }, 2);
                            });
                            
                            it('Should reduce deposit', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken1.address, alice.address)
                                ).to.be.equal(0);
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address)
                                ).to.be.equal(0);
                                
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address)
                                ).to.be.equal(0);
                            });
                            
                            it('Should return proper collateralization value', async() => {
                                const collateralization = await mainContract.getAccountCollateralization(alice.address);
                                // 0 - [(30 - 10 / 1.1) * 10 + 20 * 1] * 1.1
                                expect(collateralization).to.be.equal(ethers.utils.parseUnits('-252', 8).add(1));
                            });
                            
                            it('Should increase tresoury with liquidation bonus', async() => {
                                expect(
                                    await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                                ).to.be.equal(ethers.utils.parseUnits('10', 18).div(11));
                            });
                        });
                    });
                    
                });
                
            });
        });
    });
});
