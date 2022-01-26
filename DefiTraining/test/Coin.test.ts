import { Coin } from '@/Coin';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Factory } from './fixtures/contracts';
import { initialErc20Transfers } from './fixtures/initial-transfers';

const coinName : string = 'Test';
const coinSymbol : string = 'T';
const initialSupply : number = 100000;
const coinDecimals : number = 18;


xdescribe(`Coin`, async() => {
    let creator, alice, bob, john, jane;
    let contract : Coin;
    
    beforeEach(async() => {
        [ creator, alice, bob, john, jane ] = await ethers.getSigners();
        contract = <any>await Factory.Coin(coinName, coinSymbol, initialSupply, coinDecimals);
        await initialErc20Transfers(contract, 1000);
    });
    
    it('Should define proper initial values', async() => {
        const name = await contract.name();
        expect(name).to.be.equal(coinName);
        
        const symbol = await contract.symbol();
        expect(symbol).to.be.equal(coinSymbol);
        
        const decimals = await contract.decimals();
        expect(decimals).to.be.equal(coinDecimals);
        
        const totalSupply = await contract.totalSupply();
        expect(totalSupply).to.be.equal(initialSupply);
        
        const aliceBalance = await contract.balanceOf(alice.address);
        expect(aliceBalance).to.be.equal(1000);
        
        const janeBalance = await contract.balanceOf(jane.address);
        expect(janeBalance).to.be.equal(1000);
    });
    
});
