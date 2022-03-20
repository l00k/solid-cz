import { LoanInterestConfigChangedEvent } from '@/Interest';
import { LendingProtocol } from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { SwapProviderMock } from '@/SwapProviderMock';
import { TokenMock } from '@/TokenMock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    createTokenMock,
    deployContract,
    executeInSingleBlock,
    txExec
} from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Interest component', () => {
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
        collateralFactor : number = 5e5,
        borrowableFraction : number = 5e5
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
    });
    
    
    describe('Initial state', () => {
        it('Should return proper loan interest config', async() => {
            const config = await mainContract.getTokenLoanInterestConfig(smplToken1.address);
            expect(config).to.containSubset({
                base: 0,
                optimalUtilisation: 0,
                slope1: 0,
                slope2: 0,
            });
        });
        
        it('Should return proper utilisation', async() => {
            const utilisation = await mainContract.getTokenUtilisation(smplToken1.address);
            expect(utilisation).to.be.equal(0);
        });
        
        it('Should return proper borrow interest', async() => {
            const interest = await mainContract.getTokenBorrowInterestRate(smplToken1.address);
            expect(interest).to.be.equal(0);
        });
    });
    
    
    describe('For non supported token', () => {
        it('getTokenLoanInterestConfig() should revert', async() => {
            const query = mainContract.getTokenLoanInterestConfig(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenUtilisation() should revert', async() => {
            const query = mainContract.getTokenUtilisation(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenBorrowInterestRate() should revert', async() => {
            const query = mainContract.getTokenBorrowInterestRate(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenLoanInterestConfig() should revert', async() => {
            const tx = mainContract
                .connect(owner)
                .setTokenLoanInterestConfig(
                    WBTC_ADDRESS,
                    {
                        base: 0,
                        optimalUtilisation: 25e4,
                        slope1: 10e4,
                        slope2: 100e4,
                    }
                );
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Changing token loan interest config', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilisation: 25e4,
                        slope1: 10e4,
                        slope2: 100e4,
                    });
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilisation: 25e4,
                        slope1: 10e4,
                        slope2: 100e4,
                    })
            );
            
            await assertEvent<LoanInterestConfigChangedEvent>(result, 'LoanInterestConfigChanged', {
                token: smplToken1.address,
                interestConfig: <any>{
                    base: 0,
                    optimalUtilisation: 25e4,
                    slope1: 10e4,
                    slope2: 100e4,
                }
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenLoanInterestConfig(smplToken1.address, {
                            base: 0,
                            optimalUtilisation: 25e4,
                            slope1: 10e4,
                            slope2: 100e4,
                        })
                );
            });
            
            it('Should update state', async() => {
                const config = await mainContract.getTokenLoanInterestConfig(smplToken1.address);
                expect(config).to.containSubset({
                    base: 0,
                    optimalUtilisation: 25e4,
                    slope1: 10e4,
                    slope2: 100e4,
                });
            });
        });
    });
    
    
    describe('with token loan interest configured', () => {
        beforeEach(async() => {
            await txExec(
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilisation: 25e4,
                        slope1: 10e4,
                        slope2: 100e4,
                    })
            );
        });
        
        
    });
});
