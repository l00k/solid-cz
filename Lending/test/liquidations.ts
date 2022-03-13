import { IERC20 } from '@/IERC20';
import {
    LiquidationIncentiveChangedEvent,
    LendingProtocol,
    LoanFullyRepaidEvent,
    LoanOpenedEvent, LoanPartiallyRepaidEvent, LiquidatedEvent, LiquidatedTokenEvent
} from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { main } from 'ts-node/dist/bin';
import { assertEvent, assertIsAvailableOnlyForOwner, createTokenMock, deployContract, txExec } from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Liquidations component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    
    let smplToken0 : IERC20;
    let smplToken : IERC20;
    let smplToken2 : IERC20;
    let smplToken3 : IERC20;
    
    let priceFeedContract0 : PriceFeedMock;
    let priceFeedContract : PriceFeedMock;
    let priceFeedContract2 : PriceFeedMock;
    let priceFeedContract3 : PriceFeedMock;
    
    
    async function deposit (
        account : SignerWithAddress,
        tokenContract : IERC20,
        amount : BigNumber
    )
    {
        // approve amount before depositing
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .deposit(
                tokenContract.address,
                amount
            );
    }
    
    async function repay (
        account : SignerWithAddress,
        tokenContract : IERC20,
        amount : BigNumber
    ) : Promise<ContractTransaction>
    {
        // approve amount before repaying
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .repay(
                tokenContract.address,
                amount
            );
    }
    
    async function pushNewPriceIntoFeed (
        priceFeedContract : PriceFeedMock,
        price : BigNumber
    )
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
    
    async function setupToken(
        name : string,
        symbol : string,
        initialPrice : BigNumber,
        collateralFactor : number = 5e5,
        borrowableFraction : number = 5e5
    ) : Promise<[ IERC20, PriceFeedMock ]>
    {
        const token : IERC20 = await createTokenMock(name, symbol);
        
        const priceFeedContract : PriceFeedMock = await deployContract('PriceFeedMock');
        await txExec(
            priceFeedContract.setDecimals(8)
        );
        await txExec(
            pushNewPriceIntoFeed(priceFeedContract, initialPrice)
        );
        
        await txExec(
            mainContract.connect(owner).addSupportedAsset(token.address, priceFeedContract.address, true)
        );

        await txExec(
            mainContract.connect(owner).setTokenCollateralFactor(token.address, collateralFactor)
        );
        
        await txExec(
            mainContract.connect(owner).setTokenBorrowableFraction(token.address, borrowableFraction)
        );
        
        return [
            token,
            priceFeedContract
        ];
    }
    
    function checkLiquidatingDoesNothing ()
    {
        it('Liquidating should do nothing', async() => {
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
                    smplToken,
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
                const prevState = await mainContract.getAccountLiquidity(alice.address);
                await txExec(
                    mainContract
                        .connect(owner)
                        .liquidate(alice.address)
                );
                const newState = await mainContract.getAccountLiquidity(alice.address);
                expect(newState).to.be.equal(prevState);
            }
        });
    }
    
    
    before(async() => {
        [ owner, alice, bob, carol ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create price feed
        [ smplToken0, priceFeedContract0 ] = await setupToken(
            'Sample0',
            'SMPL0',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken, priceFeedContract ] = await setupToken(
            'Sample',
            'SMPL',
            ethers.utils.parseUnits('25', 8)
        );
        
        [ smplToken2, priceFeedContract2 ] = await setupToken(
            'Sample1',
            'SMPL1',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken3, priceFeedContract3 ] = await setupToken(
            'Sample2',
            'SMPL2',
            ethers.utils.parseUnits('10', 8)
        );
        
        // provide liquidity
        await txExec(
            deposit(bob, smplToken, ethers.utils.parseUnits('1000', 18))
        );

        await txExec(
            deposit(carol, smplToken2, ethers.utils.parseUnits('1000', 18))
        );

        await txExec(
            deposit(carol, smplToken3, ethers.utils.parseUnits('1000', 18))
        );
    });
    
    
    describe('Initial state', () => {
        it('Should return proper liquidation incentive', async() => {
            const amount = await mainContract.getLiquidationIncentive();
            expect(amount).to.be.equal(0);
        });
        
        it('Should return proper liquidation value', async() => {
            const amount = await mainContract.getAccountLiquidationValue(alice.address);
            expect(amount).to.be.equal(0);
        });
        
        checkLiquidatingDoesNothing();
    });
    
    
    describe('Changing liquidation incentive', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setLiquidationIncentive(1e5);
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setLiquidationIncentive(1e5)
            );
        
            await assertEvent<LiquidationIncentiveChangedEvent>(result, 'LiquidationIncentiveChanged', {
                fraction: 1e5,
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setLiquidationIncentive(1e5)
                );
            });
            
            it('Should update state', async() => {
                const fraction = await mainContract.getLiquidationIncentive();
                expect(fraction).to.be.equal(1e5);
            });
        });
    });
    
    
    describe('with liquidation incentive configured', () => {
        beforeEach(async() => {
            await txExec(
                mainContract
                    .connect(owner)
                    .setLiquidationIncentive(1e5)
            );
        });
        
        
        // with liquidation incentive configured
        describe('with liquidity provided by Alice', () => {
            beforeEach(async() => {
                await txExec(
                    deposit(
                        alice,
                        smplToken,
                        ethers.utils.parseUnits('40', 18)
                    )
                );
                
                await txExec(
                    deposit(
                        alice,
                        smplToken2,
                        ethers.utils.parseUnits('50', 18)
                    )
                );
                
                await txExec(
                    deposit(
                        alice,
                        smplToken3,
                        ethers.utils.parseUnits('50', 18)
                    )
                );
            });


            it('Should return proper account liquidity', async() => {
                const amount = await mainContract.getAccountLiquidity(alice.address);
                // (40 * 25 * 0.5) + (50 * 10 * 0.5) + (50 * 10 * 0.5)
                expect(amount).to.be.equal(ethers.utils.parseUnits('1000', 8));
            });

            checkLiquidatingDoesNothing();
            

            // with liquidation incentive configured
            // with liquidity provided by Alice
            describe('with Alice borrowed one asset', () => {
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

        
                it('Should return proper liquidation value', async() => {
                    const amount = await mainContract.getAccountLiquidationValue(alice.address);
                    // 30 * 10 * (1 + 0.1)
                    expect(amount).to.be.equal(ethers.utils.parseUnits('330', 8));
                });

                it('Should return proper account liquidity', async() => {
                    const amount = await mainContract.getAccountLiquidity(alice.address);
                    // 1000 - [30 * 10 * (1 + 0.1)]
                    expect(amount).to.be.equal(ethers.utils.parseUnits('670', 8));
                });
                
                checkLiquidatingDoesNothing();
                

                // with liquidation incentive configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with collateral asset price drop (liquidation of part of deposit)', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract,
                            ethers.utils.parseUnits('1', 8)
                        );
                        
                        await pushNewPriceIntoFeed(
                            priceFeedContract3,
                            ethers.utils.parseUnits('1', 8)
                        );
                    });

                    it('Should return proper account liquidity', async() => {
                        const amount = await mainContract.getAccountLiquidity(alice.address);
                        // [(40 * 1 * 0.5) + (50 * 10 * 0.5) + (50 * 1 * 0.5)] - (30 * 10 * 1.1)
                        expect(amount).to.be.equal(ethers.utils.parseUnits('-35', 8));
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
                    
                        it('Should emit Liquidated event', async() => {
                            await assertEvent<LiquidatedEvent>(result, 'Liquidated', {
                                who: alice.address,
                                value: ethers.utils.parseUnits('330', 8),
                            });
                        });
                        
                        it('Should emit LiquidatedToken events', async() => {
                            // 330 / 1 = 330 (max 40)
                            await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                who: alice.address,
                                token: smplToken.address,
                                amount: ethers.utils.parseUnits('40', 18),
                            });
                        
                            // [330 - (40 * 1)] / 10 = 29 (max 50)
                            await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('29', 18),
                            }, 1);
                        });
                        
                        it('Should emit LoanPartiallyRepaid event', async() => {
                            await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('30', 18),
                            });
                        });
                        
                        it('Should emit LoanFullyRepaid event', async() => {
                            await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                who: alice.address,
                                token: smplToken2.address,
                            });
                        });
                        
                        it('Should reduce deposit', async() => {
                            const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, alice.address);
                            expect(deposit).to.be.equal(0);
                            
                            const deposit2 = await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address);
                            expect(deposit2).to.be.equal(ethers.utils.parseUnits('21', 18));
                            
                            const deposit3 = await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address);
                            expect(deposit3).to.be.equal(ethers.utils.parseUnits('50', 18));
                        });

                        it('Should return proper account liquidity', async() => {
                            const amount = await mainContract.getAccountLiquidity(alice.address);
                            // [(21 * 10 * 0.5) + (50 * 1 * 0.5)]
                            expect(amount).to.be.equal(ethers.utils.parseUnits('130', 8));
                        });
                    });
                });
                

                // with liquidation incentive configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with collateral asset price drop (liquidation of entire deposit)', () => {
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
                    
                        await pushNewPriceIntoFeed(
                            priceFeedContract,
                            ethers.utils.parseUnits('1', 8)
                        );
                        
                        await pushNewPriceIntoFeed(
                            priceFeedContract3,
                            ethers.utils.parseUnits('1', 8)
                        );
                    });

                    it('Should return proper account liquidity', async() => {
                        const amount = await mainContract.getAccountLiquidity(alice.address);
                        // [(40 * 1 * 0.5) + (1 * 10 * 0.5) + (50 * 1 * 0.5)] - (30 * 10 * 1.1)
                        expect(amount).to.be.equal(ethers.utils.parseUnits('-280', 8));
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
                        
                        it('Should emit LiquidatedToken events', async() => {
                            // 330 / 1 = 330 (max 40)
                            await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                who: alice.address,
                                token: smplToken.address,
                                amount: ethers.utils.parseUnits('40', 18),
                            });
                        
                            // [330 - (40 * 1)] / 10 = 29 (max 1)
                            await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                who: alice.address,
                                token: smplToken2.address,
                                amount: ethers.utils.parseUnits('1', 18),
                            }, 1);
                        
                            // [330 - (40 * 1) - (1 * 10)] / 1 = 280 (max 50)
                            await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                who: alice.address,
                                token: smplToken3.address,
                                amount: ethers.utils.parseUnits('50', 18),
                            }, 2);
                        });
                        
                        it('Should reduce deposit', async() => {
                            const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, alice.address);
                            expect(deposit).to.be.equal(0);
                            
                            const deposit2 = await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address);
                            expect(deposit2).to.be.equal(0);
                            
                            const deposit3 = await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address);
                            expect(deposit3).to.be.equal(0);
                        });
                    });
                });


                // with liquidation incentive configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with borrowed asset price increase', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract2,
                            ethers.utils.parseUnits('100', 8)
                        );
                    })

                    it('Should return proper account liquidity', async() => {
                        const amount = await mainContract.getAccountLiquidity(alice.address);
                        // [(40 * 25 * 0.5) + (50 * 100 * 0.5) + (50 * 10 * 0.5)] - (30 * 100 * 1.1)
                        expect(amount).to.be.equal(ethers.utils.parseUnits('-50', 8));
                    });
                    
                    
                    describe('liquidating', () => {
                        it('Should emit Liquidated event', async() => {
                            const [ tx, result ] = await txExec(
                                mainContract
                                    .connect(owner)
                                    .liquidate(alice.address)
                            );
                            
                            await assertEvent<LiquidatedEvent>(result, 'Liquidated', {
                                who: alice.address,
                                value: ethers.utils.parseUnits('3300', 8),
                            });
                        });
                    });
                });


                // with liquidation incentive configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with Alice borrowed second asset', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .borrow(
                                    smplToken3.address,
                                    ethers.utils.parseUnits('50', 18)
                                )
                        );
                    })
        
                    it('Should return proper liquidation value', async() => {
                        const amount = await mainContract.getAccountLiquidationValue(alice.address);
                        // [ 30 * 10 + 50 * 10 ] * (1 + 0.1)
                        expect(amount).to.be.equal(ethers.utils.parseUnits('880', 8));
                    });
    
                    it('Should return proper account liquidity', async() => {
                        const amount = await mainContract.getAccountLiquidity(alice.address);
                        // 1000 - [ 30 * 10 + 50 * 10 ] * (1 + 0.1)
                        expect(amount).to.be.equal(ethers.utils.parseUnits('120', 8));
                    });
                    
                    checkLiquidatingDoesNothing();
                    
    
                    // with liquidation incentive configured
                    // with liquidity provided by Alice
                    // with Alice borrowed one asset
                    // with Alice borrowed second asset
                    describe('with collateral asset price drop', () => {
                        beforeEach(async() => {
                            await pushNewPriceIntoFeed(
                                priceFeedContract,
                                ethers.utils.parseUnits('10', 8)
                            );
                        });
    
                        it('Should return proper account liquidity', async() => {
                            const amount = await mainContract.getAccountLiquidity(alice.address);
                            // [(40 * 10 * 0.5) + (50 * 10 * 0.5) + (50 * 10 * 0.5)] - [ 30 * 10 + 50 * 10 ] * (1 + 0.1)
                            expect(amount).to.be.equal(ethers.utils.parseUnits('-180', 8));
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
                        
                            it('Should emit Liquidated event', async() => {
                                await assertEvent<LiquidatedEvent>(result, 'Liquidated', {
                                    who: alice.address,
                                    value: ethers.utils.parseUnits('880', 8),
                                });
                            });
                            
                            it('Should emit LiquidatedToken events', async() => {
                                // 880 / 10 = 88 (max 40)
                                await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                    who: alice.address,
                                    token: smplToken.address,
                                    amount: ethers.utils.parseUnits('40', 18),
                                });
                            
                                // [880 - (40 * 10)] / 10 = 48 (max 50)
                                await assertEvent<LiquidatedTokenEvent>(result, 'LiquidatedToken', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('48', 18),
                                }, 1);
                            });
                            
                            it('Should emit LoanPartiallyRepaid event', async() => {
                                await assertEvent<LoanPartiallyRepaidEvent>(result, 'LoanPartiallyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                    amount: ethers.utils.parseUnits('30', 18),
                                });
                            });
                            
                            it('Should emit LoanFullyRepaid event', async() => {
                                await assertEvent<LoanFullyRepaidEvent>(result, 'LoanFullyRepaid', {
                                    who: alice.address,
                                    token: smplToken2.address,
                                });
                            });
                            
                            it('Should reduce deposit', async() => {
                                const deposit = await mainContract.getAccountTokenDeposit(smplToken.address, alice.address);
                                expect(deposit).to.be.equal(0);
                                
                                const deposit2 = await mainContract.getAccountTokenDeposit(smplToken2.address, alice.address);
                                expect(deposit2).to.be.equal(ethers.utils.parseUnits('2', 18));
                                
                                const deposit3 = await mainContract.getAccountTokenDeposit(smplToken3.address, alice.address);
                                expect(deposit3).to.be.equal(ethers.utils.parseUnits('50', 18));
                            });
    
                            it('Should return proper account liquidity', async() => {
                                const amount = await mainContract.getAccountLiquidity(alice.address);
                                // (2 * 10 * 0.5) + (50 * 10 * 0.5)
                                expect(amount).to.be.equal(ethers.utils.parseUnits('260', 8));
                            });
                        });
                    });
                });
                
            });
        });
    });
});
